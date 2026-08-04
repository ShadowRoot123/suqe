require "rails_helper"

# The first spec in this suite that proves a permission gate *denies* anything.
#
# Every other request spec authenticates as an owner, and `create_org_and_get_token!` gives the
# owner every permission that exists — so until now not one `require_permission!` and not one
# `RequirePermissions` on the client had been shown to refuse a caller. HANDOFF.md has carried
# "no 403 spec anywhere in the suite" as a known gap for several sprints.
#
# What that hid is in the "sync pipeline" block: the REST controllers are gated, but `sync/push`
# is the app's *primary* write path and was authenticated only.
RSpec.describe "Permission gates", type: :request do
  before { skip_if_no_db! }

  # Every key the app uses, so that a narrow role is narrow by choice rather than by accident.
  let(:permission_keys) do
    %w[
      org.manage users.invite users.manage_roles
      catalog.read catalog.write
      locations.read locations.write
      inventory.read inventory.adjust inventory.view_movements
      purchasing.read purchasing.write purchasing.receive
      pos.sell pos.void_sale reports.view
    ]
  end

  def owner!
    create_org_and_get_token!(permission_keys: permission_keys)
  end

  # A second user in the *same* org holding exactly `keys` and nothing else. This is the piece
  # the suite never had: `create_org_and_get_token!` only ever makes owners.
  def member_token!(org_id:, keys:)
    user = User.create!(
      org_id: org_id, name: "Member", email: "member-#{SecureRandom.hex(4)}@example.com",
      password: "secret123", status: "active"
    )
    role = Role.create!(org_id: org_id, name: "Role #{SecureRandom.hex(4)}")
    role.permissions = Permission.where(key: keys)
    user.roles << role

    TokenService.issue_access_token(user)
  end

  def seed_sale!(token)
    post "/api/v1/locations", params: { location: { name: "Shop", type: "shop" } },
                              headers: auth_headers(token), as: :json
    location_id = JSON.parse(response.body).dig("location", "id")

    post "/api/v1/products", params: { product: { name: "Thing" } },
                             headers: auth_headers(token), as: :json
    product_id = JSON.parse(response.body).dig("product", "id")

    post "/api/v1/variants", params: { variant: { product_id: product_id, sku: "SKU-1", price: "10.00" } },
                             headers: auth_headers(token), as: :json
    variant_id = JSON.parse(response.body).dig("variant", "id")

    post "/api/v1/sales", params: {
      sale: {
        location_id: location_id,
        items: [{ variant_id: variant_id, quantity: "1", unit_price: "10.00" }],
        payments: [{ method: "cash", amount: "10.00" }]
      }
    }, headers: auth_headers(token), as: :json

    { location_id: location_id, variant_id: variant_id, sale_id: JSON.parse(response.body).dig("sale", "id") }
  end

  describe "the REST surface" do
    it "refuses a write the caller's role does not carry, and allows the one it does" do
      owner = owner!
      writer = member_token!(org_id: owner.fetch(:org_id), keys: %w[catalog.read catalog.write])
      reader = member_token!(org_id: owner.fetch(:org_id), keys: %w[catalog.read])

      post "/api/v1/categories", params: { category: { name: "Denied" } },
                                 headers: auth_headers(reader), as: :json
      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body).fetch("code")).to eq("forbidden")

      post "/api/v1/categories", params: { category: { name: "Allowed" } },
                                 headers: auth_headers(writer), as: :json
      expect(response).to have_http_status(:created)
    end

    it "refuses a read to a role that carries no read permission at all" do
      owner = owner!
      nobody = member_token!(org_id: owner.fetch(:org_id), keys: [])

      get "/api/v1/products", headers: auth_headers(nobody)
      expect(response).to have_http_status(:forbidden)
    end

    # The distinction Sprint G Day 1 drew: taking the money and undoing it are different jobs.
    it "lets pos.sell ring up a sale but not void one" do
      owner = owner!
      ids = seed_sale!(owner.fetch(:token))
      cashier = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell])

      post "/api/v1/sales/#{ids.fetch(:sale_id)}/void", headers: auth_headers(cashier), as: :json
      expect(response).to have_http_status(:forbidden)
      expect(Sale.find(ids.fetch(:sale_id)).status).to eq("completed")

      supervisor = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell pos.void_sale])
      post "/api/v1/sales/#{ids.fetch(:sale_id)}/void", headers: auth_headers(supervisor), as: :json
      expect(response).to have_http_status(:ok)
      expect(Sale.find(ids.fetch(:sale_id)).status).to eq("voided")
    end
  end

  # `sync/push` is how every mobile write reaches the server — the REST controllers are for the
  # future web/admin surface. It authenticated the caller and then asked nothing else, so a role
  # was only ever a UI suggestion: the client hides a screen, and anything that can reach the API
  # issues the command regardless.
  describe "the sync pipeline" do
    def push!(token, commands)
      post "/api/v1/sync/push", params: { device_id: "device-1", commands: commands },
                                headers: auth_headers(token), as: :json
      JSON.parse(response.body).fetch("outcomes")
    end

    it "refuses a command the caller's role does not carry" do
      owner = owner!
      cashier = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell])

      outcomes = push!(cashier, [
        { idempotency_key: "cat-1", entity: "category", operation: "create",
          payload: { id: SecureRandom.uuid, name: "Snuck in" } }
      ])

      expect(outcomes.first).to include("idempotency_key" => "cat-1", "status" => "invalid")
      expect(outcomes.first.fetch("error")).to match(/catalog\.write/)
      # Refused before it is queued, so `ProcessPending` never sees it at all.
      expect(SyncOutbox.where(org_id: owner.fetch(:org_id)).count).to eq(0)

      OfflineSync::ProcessPending.call(org_id: owner.fetch(:org_id))
      expect(Category.where(org_id: owner.fetch(:org_id)).count).to eq(0)
    end

    # The same line the REST endpoint draws, now drawn on the path the till actually uses.
    it "lets pos.sell push a sale but not the update that voids it" do
      owner = owner!
      ids = seed_sale!(owner.fetch(:token))
      cashier = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell])

      outcomes = push!(cashier, [
        { idempotency_key: "void-1", entity: "sale", operation: "update",
          payload: { id: ids.fetch(:sale_id), status: "voided" } }
      ])
      expect(outcomes.first).to include("status" => "invalid")
      expect(outcomes.first.fetch("error")).to match(/pos\.void_sale/)

      OfflineSync::ProcessPending.call(org_id: owner.fetch(:org_id))
      expect(Sale.find(ids.fetch(:sale_id)).status).to eq("completed")

      supervisor = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell pos.void_sale])
      outcomes = push!(supervisor, [
        { idempotency_key: "void-2", entity: "sale", operation: "update",
          payload: { id: ids.fetch(:sale_id), status: "voided" } }
      ])
      expect(outcomes.first).to include("status" => "enqueued")

      OfflineSync::ProcessPending.call(org_id: owner.fetch(:org_id))
      expect(Sale.find(ids.fetch(:sale_id)).status).to eq("voided")
    end

    # A batch is not all-or-nothing: the commands the caller may issue still go through, so one
    # refused command cannot strand an outbox that would otherwise retry forever.
    it "refuses only the commands the role does not cover, and keeps the rest" do
      owner = owner!
      ids = seed_sale!(owner.fetch(:token))
      cashier = member_token!(org_id: owner.fetch(:org_id), keys: %w[pos.sell])
      sale_id = SecureRandom.uuid

      outcomes = push!(cashier, [
        { idempotency_key: "sale-ok", entity: "sale", operation: "create",
          payload: { id: sale_id, location_id: ids.fetch(:location_id),
                     items: [{ variant_id: ids.fetch(:variant_id), quantity: "1", unit_price: "10.00" }],
                     payments: [{ method: "cash", amount: "10.00" }] } },
        { idempotency_key: "loc-no", entity: "location", operation: "delete",
          payload: { id: ids.fetch(:location_id) } }
      ])

      expect(outcomes[0]).to include("idempotency_key" => "sale-ok", "status" => "enqueued")
      expect(outcomes[1]).to include("idempotency_key" => "loc-no", "status" => "invalid")

      OfflineSync::ProcessPending.call(org_id: owner.fetch(:org_id))
      expect(Sale.find_by(id: sale_id)).to be_present
      expect(Location.find_by(id: ids.fetch(:location_id))).to be_present
    end

    # Fail closed. An entity the server does not recognise cannot be permission-checked, and
    # `ProcessPending` treats an unknown one as an applied no-op — so letting it queue would mean
    # accepting, on the strength of a typo, a write nobody has authorised.
    it "refuses an entity it does not recognise, whatever the role" do
      owner = owner!

      outcomes = push!(owner.fetch(:token), [
        { idempotency_key: "who-1", entity: "wormhole", operation: "create", payload: { id: SecureRandom.uuid } }
      ])

      expect(outcomes.first).to include("status" => "invalid")
      expect(outcomes.first.fetch("error")).to match(/wormhole/)
    end

    it "still lets an owner push everything" do
      owner = owner!

      outcomes = push!(owner.fetch(:token), [
        { idempotency_key: "own-1", entity: "category", operation: "create",
          payload: { id: SecureRandom.uuid, name: "Fine" } }
      ])

      expect(outcomes.first).to include("status" => "enqueued")
    end
  end
end
