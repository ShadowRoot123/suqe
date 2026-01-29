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

  private

  def set_request_id_header
    response.set_header("X-Request-Id", request.request_id)
  end

  def render_error(code:, message:, status:, details: nil)
    payload = { code:, message: }
    payload[:details] = details if details.present?
    render json: payload, status:
  end
end
