require "rails_helper"

RSpec.describe "OfflineSync", type: :request do
  before do
    ActiveRecord::Base.connection.execute("SELECT 1")
  rescue StandardError
    skip "Database not available"
  end

  def create_org!
    post "/api/v1/orgs", params: {
      name: "My Shop",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json
    expect(response).to have_http_status(:created)
    JSON.parse(response.body)
  end

  def auth_headers(token)
    { "Authorization" => "Bearer #{token}" }
  end

  def sync_outbox_count_for(org_id)
    connection = ActiveRecord::Base.connection
    result = connection.execute("SELECT COUNT(*) AS count FROM sync_outbox WHERE org_id = #{connection.quote(org_id)};")
    result.first.fetch("count").to_i
  end

  it "requires auth for sync push" do
    post "/api/v1/sync/push", params: { device_id: "device-1", commands: [] }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  it "enqueues commands and is idempotent by idempotency_key" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")

    expect(sync_outbox_count_for(org_id)).to eq(0)

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } }
      ]
    }, headers: auth_headers(token), as: :json

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("outcomes")).to match([
      a_hash_including("idempotency_key" => "cmd-1", "status" => "enqueued", "outbox_id" => a_kind_of(String))
    ])
    expect(sync_outbox_count_for(org_id)).to eq(1)

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } }
      ]
    }, headers: auth_headers(token), as: :json

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("outcomes")).to match([
      a_hash_including("idempotency_key" => "cmd-1", "status" => "duplicate", "outbox_id" => a_kind_of(String))
    ])
    expect(sync_outbox_count_for(org_id)).to eq(1)
  end

  it "marks invalid commands in outcomes but still returns ok" do
    org_body = create_org!
    token = org_body.fetch("access_token")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } },
        { idempotency_key: "cmd-2", operation: "create", payload: {} }
      ]
    }, headers: auth_headers(token), as: :json

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("outcomes")).to include(
      a_hash_including("idempotency_key" => "cmd-1", "status" => "enqueued"),
      a_hash_including("idempotency_key" => "cmd-2", "status" => "invalid", "error" => a_kind_of(String))
    )
  end

  it "requires device_id and commands for sync push" do
    org_body = create_org!
    token = org_body.fetch("access_token")

    post "/api/v1/sync/push", params: { commands: [] }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:bad_request)
    expect(JSON.parse(response.body).fetch("code")).to eq("parameter_missing")
  end

  it "requires auth for sync pull" do
    get "/api/v1/sync/pull"
    expect(response).to have_http_status(:unauthorized)
  end

  it "returns a cursor response for sync pull" do
    org_body = create_org!
    token = org_body.fetch("access_token")

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to eq([])
    expect(body.fetch("changes")).to eq([])
    expect(body.fetch("next_cursor")).to be_a(String)
  end

  it "returns acknowledgements for processed commands" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1", "status" => "applied"))
  end

  it "filters acknowledgements by cursor" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
    first_cursor = JSON.parse(response.body).fetch("next_cursor")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    get "/api/v1/sync/pull", params: { cursor: first_cursor }, headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1"))
  end

  it "returns failed acknowledgements for unsupported operations" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "weird", payload: { foo: "bar" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1", "status" => "failed"))
  end
end
