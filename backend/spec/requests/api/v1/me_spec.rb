require "rails_helper"

RSpec.describe "Me", type: :request do
  before do
    ActiveRecord::Base.connection.execute("SELECT 1")
  rescue StandardError
    skip "Database not available"
  end

  it "requires auth" do
    get "/api/v1/me", as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  it "returns role names and permission keys for current user" do
    ActiveRecord::Base.connection.execute <<~SQL
      INSERT INTO permissions (id, key)
      VALUES (gen_random_uuid(), 'users.manage_roles')
      ON CONFLICT (key) DO NOTHING;
    SQL

    post "/api/v1/orgs", params: {
      name: "My Shop",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json
    token = JSON.parse(response.body).fetch("access_token")

    get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }, as: :json
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.dig("user", "email")).to eq("owner@example.com")
    expect(body.fetch("role_names")).to include("Owner")
    expect(body.fetch("permissions")).to include("users.manage_roles")
  end
end

