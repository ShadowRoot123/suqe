require "rails_helper"

RSpec.describe "UsersManagement", type: :request do
  let(:permission_keys) { %w[users.manage_roles] }

  before { skip_if_no_db! }

  it "lists and updates users" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)
    user_id = session.fetch(:user_id)

    get "/api/v1/users", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)
    users = JSON.parse(response.body).fetch("users")
    expect(users.map { |u| u.fetch("id") }).to include(user_id)

    patch "/api/v1/users/#{user_id}",
          params: { user: { name: "Owner Updated", status: "active" } },
          headers: auth_headers(token),
          as: :json
    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("user")
    expect(updated.fetch("name")).to eq("Owner Updated")

    get "/api/v1/users/#{user_id}", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)
    shown = JSON.parse(response.body).fetch("user")
    expect(shown.fetch("id")).to eq(user_id)
  end
end

