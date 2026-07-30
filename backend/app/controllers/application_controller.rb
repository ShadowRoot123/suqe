class ApplicationController < ActionController::API
  # A destroy blocked by a foreign key surfaces as one of two Postgres errors depending on the
  # constraint: foreign_key_violation (23503) for NO ACTION, which Rails maps to
  # InvalidForeignKey, and restrict_violation (23001) for ON DELETE RESTRICT, which it does not
  # map at all. Every foreign key into locations, suppliers and friends is RESTRICT, so matching
  # on the cause is the only way to catch both.
  FOREIGN_KEY_VIOLATION_CAUSES = /RestrictViolation|ForeignKeyViolation/

  before_action :set_request_id_header

  # ORDER MATTERS, AND IT IS BACKWARDS FROM A `rescue` CHAIN. rescue_from resolves handlers
  # most-recently-declared-first, so the *general* case must be declared first and the specific
  # ones after it — a catch-all placed last silently shadows everything above it. Keep this list
  # sorted general to specific:
  #
  #   StandardError > StatementInvalid > {RecordNotUnique, InvalidForeignKey}
  #
  # RecordNotUnique and InvalidForeignKey are both subclasses of StatementInvalid, which is easy
  # to miss. `spec/models/error_handling_spec.rb` asserts which handler each error class actually
  # resolves to, so a reordering that breaks this cannot pass silently.
  rescue_from StandardError do |error|
    handle_unexpected_error(error)
  end

  # The RESTRICT half of the foreign-key story (23001). A plain foreign_key_violation (23503)
  # arrives as InvalidForeignKey and is handled below. Anything else wrapped in a StatementInvalid
  # is a real fault, and is treated as one rather than reported to the caller as a conflict it
  # is not.
  rescue_from ActiveRecord::StatementInvalid do |error|
    if error.cause.class.name.match?(FOREIGN_KEY_VIOLATION_CAUSES)
      render_error(
        code: "invalid_foreign_key",
        message: "Record is referenced by other records",
        status: :conflict
      )
    else
      handle_unexpected_error(error)
    end
  end

  rescue_from ActiveRecord::RecordNotUnique do |_error|
    render_error(
      code: "not_unique",
      message: "Record already exists",
      status: :conflict
    )
  end

  rescue_from ActiveRecord::InvalidForeignKey do |_error|
    render_error(
      code: "invalid_foreign_key",
      message: "Record is referenced by other records",
      status: :conflict
    )
  end

  rescue_from ActiveRecord::RecordNotFound do |error|
    render_error(code: "not_found", message: error.message, status: :not_found)
  end

  rescue_from ActiveRecord::RecordInvalid do |error|
    render_error(
      code: "validation_error",
      message: "Validation failed",
      status: :unprocessable_entity,
      details: error.record.errors.to_hash(true)
    )
  end

  rescue_from ActionController::ParameterMissing do |error|
    render_error(
      code: "parameter_missing",
      message: error.message,
      status: :bad_request
    )
  end

  def route_not_found
    render_error(code: "not_found", message: "Route not found", status: :not_found)
  end

  def current_user
    @current_user
  end

  def current_organization
    @current_organization
  end

  private

  # Shared by the catch-all and the StatementInvalid handler: outside production the real error
  # is re-raised so it lands in the test output and the developer's console intact.
  def handle_unexpected_error(error)
    raise error unless Rails.env.production?

    render_error(
      code: "internal_error",
      message: "Internal server error",
      status: :internal_server_error
    )
  end

  def authenticate!
    header = request.authorization.to_s
    token = header.delete_prefix("Bearer ").strip

    payload = TokenService.verify_access_token(token)
    return render_error(code: "unauthorized", message: "Unauthorized", status: :unauthorized) if payload.blank?

    user = User.find_by(id: payload[:user_id], org_id: payload[:org_id])
    return render_error(code: "unauthorized", message: "Unauthorized", status: :unauthorized) if user.blank?
    return render_error(code: "unauthorized", message: "Unauthorized", status: :unauthorized) if user.status == "disabled"

    @current_user = user
    @current_organization = Organization.find(user.org_id)
  end

  def require_permission!(permission_key)
    return if current_user.roles.joins(:permissions).where(permissions: { key: permission_key }).exists?

    render_error(code: "forbidden", message: "Forbidden", status: :forbidden)
  end

  def set_request_id_header
    response.set_header("X-Request-Id", request.request_id)
  end

  def render_error(code:, message:, status:, details: nil)
    payload = { code:, message: }
    payload[:details] = details if details.present?
    render json: payload, status:
  end
end
