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

  def audit_log_count_for(org_id)
    connection = ActiveRecord::Base.connection
    result = connection.execute("SELECT COUNT(*) AS count FROM audit_logs WHERE org_id = #{connection.quote(org_id)};")
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

  it "returns mixed outcomes in a single batch" do
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
    expect(sync_outbox_count_for(org_id)).to eq(1)

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "sale", operation: "create", payload: { foo: "bar" } },
        { idempotency_key: "cmd-2", entity: "sale", operation: "create", payload: { foo: "bar" } },
        { idempotency_key: "cmd-3", operation: "create", payload: {} }
      ]
    }, headers: auth_headers(token), as: :json

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    outcomes = body.fetch("outcomes")
    expect(outcomes[0]).to include("idempotency_key" => "cmd-1", "status" => "duplicate")
    expect(outcomes[1]).to include("idempotency_key" => "cmd-2", "status" => "enqueued")
    expect(outcomes[2]).to include("idempotency_key" => "cmd-3", "status" => "invalid")
    expect(sync_outbox_count_for(org_id)).to eq(2)
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

  it "validates cursor format" do
    org_body = create_org!
    token = org_body.fetch("access_token")

    get "/api/v1/sync/pull", params: { cursor: "not-a-time" }, headers: auth_headers(token)
    expect(response).to have_http_status(:unprocessable_entity)
    body = JSON.parse(response.body)
    expect(body.fetch("code")).to eq("validation_error")
    expect(body.dig("details", "cursor")).to be_present
  end

  it "clamps limit to a safe range" do
    org_body = create_org!
    token = org_body.fetch("access_token")

    get "/api/v1/sync/pull", params: { limit: 0 }, headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    get "/api/v1/sync/pull", params: { limit: 10_000 }, headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
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

  it "writes an audit log and returns it as a change" do
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

    expect(audit_log_count_for(org_id)).to eq(0)
    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(audit_log_count_for(org_id)).to eq(1)

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body.fetch("changes")).to include(
      a_hash_including("action" => a_kind_of(String), "metadata" => a_hash_including("idempotency_key" => "cmd-1"))
    )
  end

  it "filters changes by cursor" do
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
    expect(body.fetch("changes")).to include(a_hash_including("metadata" => a_hash_including("idempotency_key" => "cmd-1")))
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

  it "does not reprocess already applied items" do
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

    result = OfflineSync::ProcessPending.call(org_id: org_id)
    expect(result.fetch(:processed_ids).length).to eq(1)

    result = OfflineSync::ProcessPending.call(org_id: org_id)
    expect(result.fetch(:processed_ids).length).to eq(0)
  end

  it "applies category create/update/delete and returns changes" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")
    category_id = SecureRandom.uuid

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "category", operation: "create", payload: { id: category_id, name: "Snacks" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    expect(Category.find_by(org_id: org_id, id: category_id)&.name).to eq("Snacks")

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1", "status" => "applied"))
    expect(body.fetch("changes")).to include(
      a_hash_including("entity" => "category", "entity_id" => category_id, "metadata" => a_hash_including("operation" => "create"))
    )

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-2", entity: "category", operation: "update", payload: { id: category_id, name: "Chips" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(Category.find_by(org_id: org_id, id: category_id)&.name).to eq("Chips")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-3", entity: "category", operation: "delete", payload: { id: category_id } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(Category.find_by(org_id: org_id, id: category_id)).to be_nil
  end

  it "marks category create as failed when missing name" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")
    category_id = SecureRandom.uuid

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "category", operation: "create", payload: { id: category_id } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1", "status" => "failed"))
    expect(body.fetch("changes")).to include(a_hash_including("entity" => "category", "metadata" => a_hash_including("error" => a_kind_of(String))))
  end

  it "applies product and variant create/update/delete" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")
    product_id = SecureRandom.uuid
    variant_id = SecureRandom.uuid

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "product", operation: "create", payload: { id: product_id, name: "Cola" } },
        {
          idempotency_key: "cmd-2",
          entity: "variant",
          operation: "create",
          payload: { id: variant_id, product_id: product_id, sku: "COLA-001", barcode: "123" }
        }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(Product.find_by(org_id: org_id, id: product_id)&.name).to eq("Cola")
    connection = ActiveRecord::Base.connection
    audit = connection.execute(
      "SELECT action, metadata FROM audit_logs WHERE org_id = #{connection.quote(org_id)} AND metadata->>'idempotency_key' = 'cmd-2' ORDER BY created_at DESC LIMIT 1;"
    ).first
    expect(audit).to be_present
    expect(JSON.parse(audit.fetch("metadata")).fetch("error", nil)).to be_nil
    expect(Variant.find_by(org_id: org_id, id: variant_id)&.sku).to eq("COLA-001")

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-1", "status" => "applied"))
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-2", "status" => "applied"))
    expect(body.fetch("changes")).to include(a_hash_including("entity" => "product", "entity_id" => product_id))
    expect(body.fetch("changes")).to include(a_hash_including("entity" => "variant", "entity_id" => variant_id))

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-3", entity: "product", operation: "update", payload: { id: product_id, name: "Diet Cola" } },
        { idempotency_key: "cmd-4", entity: "variant", operation: "update", payload: { id: variant_id, sku: "COLA-002" } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(Product.find_by(org_id: org_id, id: product_id)&.name).to eq("Diet Cola")
    expect(Variant.find_by(org_id: org_id, id: variant_id)&.sku).to eq("COLA-002")

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-5", entity: "variant", operation: "delete", payload: { id: variant_id } },
        { idempotency_key: "cmd-6", entity: "product", operation: "delete", payload: { id: product_id } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)
    expect(Variant.find_by(org_id: org_id, id: variant_id)).to be_nil
    expect(Product.find_by(org_id: org_id, id: product_id)).to be_nil
  end

  it "marks variant create as failed when missing sku" do
    org_body = create_org!
    token = org_body.fetch("access_token")
    org_id = org_body.dig("organization", "id")
    product_id = SecureRandom.uuid
    variant_id = SecureRandom.uuid

    post "/api/v1/sync/push", params: {
      device_id: "device-1",
      commands: [
        { idempotency_key: "cmd-1", entity: "product", operation: "create", payload: { id: product_id, name: "Cola" } },
        { idempotency_key: "cmd-2", entity: "variant", operation: "create", payload: { id: variant_id, product_id: product_id } }
      ]
    }, headers: auth_headers(token), as: :json
    expect(response).to have_http_status(:ok)

    OfflineSync::ProcessPending.call(org_id: org_id)

    get "/api/v1/sync/pull", headers: auth_headers(token)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch("acks")).to include(a_hash_including("idempotency_key" => "cmd-2", "status" => "failed"))
    expect(body.fetch("changes")).to include(a_hash_including("entity" => "variant", "metadata" => a_hash_including("error" => a_kind_of(String))))
  end
end
