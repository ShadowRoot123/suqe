require "rails_helper"

RSpec.describe "Roles", type: :request do
  let(:permission_keys) { %w[users.manage_roles catalog.read catalog.write] }

  before { skip_if_no_db! }

  it "supports CRUD for roles with permission assignment" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)

    post "/api/v1/roles",
         params: { role: { name: "Manager" }, permission_keys: %w[catalog.read catalog.write] },
         headers: auth_headers(token),
         as: :json
    expect(response).to have_http_status(:created)
    created = JSON.parse(response.body).fetch("role")
    role_id = created.fetch("id")
    expect(created.fetch("permission_keys")).to include("catalog.read", "catalog.write")

    get "/api/v1/roles/#{role_id}", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    patch "/api/v1/roles/#{role_id}",
          params: { role: { name: "Supervisor" }, permission_keys: %w[catalog.read] },
          headers: auth_headers(token),
          as: :json
    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("role")
    expect(updated.fetch("name")).to eq("Supervisor")
    expect(updated.fetch("permission_keys")).to eq(["catalog.read"])

    delete "/api/v1/roles/#{role_id}", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:no_content)
  end
end

