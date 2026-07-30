require "rails_helper"

RSpec.describe "Inventory", type: :request do
  let(:permission_keys) { %w[catalog.write locations.write inventory.adjust inventory.read inventory.view_movements] }

  before { skip_if_no_db! }

  it "adjusts inventory and reads snapshots/movements" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)
    auth = auth_headers(token)

    post "/api/v1/locations",
         params: { location: { name: "Shop", type: "shop" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    location_id = JSON.parse(response.body).dig("location", "id")

    post "/api/v1/products",
         params: { product: { name: "Coffee" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    product_id = JSON.parse(response.body).dig("product", "id")

    post "/api/v1/variants",
         params: { variant: { product_id: product_id, sku: "SKU-INV-1", attrs: {}, price: "10.00", cost_price: "5.00" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    variant_id = JSON.parse(response.body).dig("variant", "id")

    post "/api/v1/inventory_movements",
         params: { inventory_movement: { variant_id: variant_id, location_id: location_id, quantity_delta: "5", note: "Initial" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)

    get "/api/v1/inventory_snapshots?variant_id=#{variant_id}&location_id=#{location_id}", headers: auth
    expect(response).to have_http_status(:ok)
    snapshots = JSON.parse(response.body).fetch("inventory_snapshots")
    expect(snapshots.first.fetch("quantity").to_d).to eq(5.to_d)

    get "/api/v1/inventory_movements?variant_id=#{variant_id}&location_id=#{location_id}", headers: auth
    expect(response).to have_http_status(:ok)
    movements = JSON.parse(response.body).fetch("inventory_movements")
    expect(movements.first.fetch("type")).to eq("adjustment")
  end

  # The movement log is the ledger read newest-first with filters and a keyset cursor; the
  # timestamps are pinned by hand so ordering and date bounds are not a matter of clock luck.
  describe "movement log" do
    def create_variant!(org_id, sku:)
      product = Product.create!(org_id: org_id, name: "Product #{sku}")
      Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
    end

    def movement!(org_id, variant:, location:, quantity:, at:, type: "adjustment", actor: nil)
      movement = Inventory::RecordMovement.call(
        org_id: org_id,
        variant_id: variant.id,
        location_id: location.id,
        quantity_delta: quantity,
        type: type,
        created_by: actor
      )
      movement.update_column(:created_at, at)
      movement
    end

    it "filters by type, actor and date range" do
      session = create_org_and_get_token!(permission_keys: permission_keys)
      auth = auth_headers(session.fetch(:token))
      org_id = session.fetch(:org_id)
      shop = Location.create!(org_id: org_id, name: "Shop", type: "shop")
      variant = create_variant!(org_id, sku: "SKU-LOG")

      old_purchase = movement!(org_id, variant: variant, location: shop, quantity: "10",
                                       at: Time.utc(2026, 7, 1, 12), type: "purchase")
      mine = movement!(org_id, variant: variant, location: shop, quantity: "-2",
                               at: Time.utc(2026, 7, 15, 12), type: "sale", actor: session.fetch(:user_id))
      recent = movement!(org_id, variant: variant, location: shop, quantity: "-1",
                                 at: Time.utc(2026, 7, 20, 12), type: "sale")

      get "/api/v1/inventory_movements?type=sale", headers: auth
      expect(response).to have_http_status(:ok)
      expect(ids_from(response)).to eq([recent.id, mine.id])

      get "/api/v1/inventory_movements?created_by=#{session.fetch(:user_id)}", headers: auth
      expect(ids_from(response)).to eq([mine.id])

      get "/api/v1/inventory_movements?from=2026-07-10&to=2026-07-16", headers: auth
      expect(ids_from(response)).to eq([mine.id])

      get "/api/v1/inventory_movements?to=2026-07-10", headers: auth
      expect(ids_from(response)).to eq([old_purchase.id])
    end

    it "pages newest-first through a keyset cursor without repeating or skipping a row" do
      session = create_org_and_get_token!(permission_keys: permission_keys)
      auth = auth_headers(session.fetch(:token))
      org_id = session.fetch(:org_id)
      shop = Location.create!(org_id: org_id, name: "Shop", type: "shop")
      variant = create_variant!(org_id, sku: "SKU-PAGE")

      oldest = movement!(org_id, variant: variant, location: shop, quantity: "1", at: Time.utc(2026, 7, 1, 12))
      middle = movement!(org_id, variant: variant, location: shop, quantity: "2", at: Time.utc(2026, 7, 2, 12))
      newest = movement!(org_id, variant: variant, location: shop, quantity: "3", at: Time.utc(2026, 7, 3, 12))

      get "/api/v1/inventory_movements?limit=2", headers: auth
      expect(response).to have_http_status(:ok)
      first_page = JSON.parse(response.body)
      expect(first_page.fetch("inventory_movements").map { |m| m.fetch("id") }).to eq([newest.id, middle.id])
      cursor = first_page.fetch("next_cursor")
      expect(cursor).to be_present

      get "/api/v1/inventory_movements?limit=2&cursor=#{CGI.escape(cursor)}", headers: auth
      expect(response).to have_http_status(:ok)
      second_page = JSON.parse(response.body)
      expect(second_page.fetch("inventory_movements").map { |m| m.fetch("id") }).to eq([oldest.id])
      # No extra row, so no cursor: the client stops here instead of asking for an empty page.
      expect(second_page.fetch("next_cursor")).to be_nil
    end

    it "rejects a bad type, date and cursor with 422 and ignores a junk limit" do
      session = create_org_and_get_token!(permission_keys: permission_keys)
      auth = auth_headers(session.fetch(:token))
      org_id = session.fetch(:org_id)
      shop = Location.create!(org_id: org_id, name: "Shop", type: "shop")
      variant = create_variant!(org_id, sku: "SKU-BAD")
      movement!(org_id, variant: variant, location: shop, quantity: "1", at: Time.utc(2026, 7, 1, 12))
      movement!(org_id, variant: variant, location: shop, quantity: "2", at: Time.utc(2026, 7, 2, 12))

      get "/api/v1/inventory_movements?type=teleported", headers: auth
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_type")

      get "/api/v1/inventory_movements?from=not-a-date", headers: auth
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_date")

      # A non-uuid id inside an otherwise well-formed cursor would reach Postgres as a cast error.
      get "/api/v1/inventory_movements?cursor=#{CGI.escape(Base64.urlsafe_encode64('2026-07-01T00:00:00Z|nope'))}",
          headers: auth
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_cursor")

      get "/api/v1/inventory_movements?cursor=not-base64", headers: auth
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_cursor")

      # `to_i` would turn this into 0, clamp it to 1, and make the ledger look almost empty.
      get "/api/v1/inventory_movements?limit=lots", headers: auth
      expect(response).to have_http_status(:ok)
      expect(ids_from(response).size).to eq(2)
    end
  end

  def ids_from(response)
    JSON.parse(response.body).fetch("inventory_movements").map { |m| m.fetch("id") }
  end
end

