require "rails_helper"

RSpec.describe "Permissions", type: :request do
  let(:permission_keys) { %w[users.manage_roles catalog.read] }

  before { skip_if_no_db! }

  it "lists permissions" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)

    get "/api/v1/permissions", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)
    keys = JSON.parse(response.body).fetch("permissions")
    expect(keys).to include("catalog.read")
  end
end

