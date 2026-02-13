require "rails_helper"

RSpec.describe "AdminReads", type: :request do
  let(:permission_keys) { %w[org.manage] }

  before { skip_if_no_db! }

  it "reads audit logs and sync outbox" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)

    get "/api/v1/audit_logs", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    get "/api/v1/sync_outbox", headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)
  end
end

