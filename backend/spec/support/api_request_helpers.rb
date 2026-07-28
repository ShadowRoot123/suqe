module ApiRequestHelpers
  def ensure_permissions!(keys)
    connection = ActiveRecord::Base.connection
    keys.each do |key|
      connection.execute <<~SQL
        INSERT INTO permissions (id, key)
        VALUES (gen_random_uuid(), #{connection.quote(key)})
        ON CONFLICT (key) DO NOTHING;
      SQL
    end
  end

  def create_org_and_get_token!(permission_keys:)
    ensure_permissions!(permission_keys)

    post "/api/v1/orgs", params: {
      name: "My Shop",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json

    expect(response).to have_http_status(:created)
    body = JSON.parse(response.body)
    {
      token: body.fetch("access_token"),
      org_id: body.dig("organization", "id"),
      user_id: body.dig("user", "id")
    }
  end

  def auth_headers(token)
    { "Authorization" => "Bearer #{token}" }
  end

  def skip_if_no_db!
    ActiveRecord::Base.connection.execute("SELECT 1")
  rescue StandardError
    skip "Database not available"
  end
end

RSpec.configure do |config|
  config.include ApiRequestHelpers, type: :request
  # domain specs only need skip_if_no_db!
  config.include ApiRequestHelpers, type: :model
end

