require "rails_helper"

RSpec.describe "AuthOrg", type: :request do
  let(:permission_keys) do
    %w[
      users.invite
      users.manage_roles
    ]
  end

  before do
    ActiveRecord::Base.connection.execute("SELECT 1")
  rescue StandardError
    skip "Database not available"
  end

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

  it "creates an org and returns an access token" do
    ensure_permissions!(permission_keys)

    post "/api/v1/orgs", params: {
      name: "My Shop",
      currency: "USD",
      tax_mode: "exclusive",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json

    expect(response).to have_http_status(:created)
    body = JSON.parse(response.body)
    expect(body.fetch("access_token")).to be_a(String)
    expect(body.dig("organization", "id")).to be_a(String)
    expect(body.dig("user", "email")).to eq("owner@example.com")
  end

  it "logs in and can invite + accept invite" do
    ensure_permissions!(permission_keys)

    post "/api/v1/orgs", params: {
      name: "My Shop",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json
    org_body = JSON.parse(response.body)
    org_id = org_body.dig("organization", "id")

    post "/api/v1/auth/login", params: { org_id: org_id, email: "owner@example.com", password: "secret123" }, as: :json
    expect(response).to have_http_status(:ok)
    token = JSON.parse(response.body).fetch("access_token")

    post "/api/v1/users/invite",
         params: { email: "staff@example.com", name: "Staff" },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:created)
    invite_token = JSON.parse(response.body).fetch("invite_token")

    post "/api/v1/users/accept_invite", params: { token: invite_token, password: "staffpass123" }, as: :json
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch("access_token")).to be_a(String)
  end
end
