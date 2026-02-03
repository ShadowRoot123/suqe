# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins do |origin, _env|
      configured = ENV["CORS_ORIGINS"]
      if configured.present?
        configured.split(",").map(&:strip).include?(origin)
      else
        origin.match?(/\Ahttps?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\z/) ||
          origin.match?(/\Ahttps?:\/\/\[::1\](:\d+)?\z/)
      end
    end

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      expose: ["x-request-id"],
      max_age: 600
  end
end
