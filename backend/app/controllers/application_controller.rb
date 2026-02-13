class ApplicationController < ActionController::API
  before_action :set_request_id_header

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

  rescue_from ActionController::ParameterMissing do |error|
    render_error(
      code: "parameter_missing",
      message: error.message,
      status: :bad_request
    )
  end

  rescue_from StandardError do |error|
    raise error unless Rails.env.production?

    render_error(
      code: "internal_error",
      message: "Internal server error",
      status: :internal_server_error
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
