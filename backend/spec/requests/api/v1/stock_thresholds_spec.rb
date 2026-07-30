require "rails_helper"

# Reorder points are written through the sync command pipeline (see sync_spec), so this REST
# surface is read-only: the bootstrap read a fresh install uses to fill its local cache, and the
# online-first low-stock view.
RSpec.describe "Stock thresholds", type: :request do
  let(:permission_keys) { %w[inventory.read inventory.adjust catalog.write locations.write] }

  before { skip_if_no_db! }

  def start_session!
    session = create_org_and_get_token!(permission_keys: permission_keys)
    [session.fetch(:token), session.fetch(:org_id)]
  end

  def create_variant!(org_id, sku:)
    product = Product.create!(org_id: org_id, name: "Product #{sku}")
    Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
  end

  def create_location!(org_id, name:, type: "shop")
    Location.create!(org_id: org_id, name: name, type: type)
  end

  def create_threshold!(org_id, variant:, point:, location: nil, quantity: nil)
    StockThreshold.create!(
      org_id: org_id,
      variant_id: variant.id,
      location_id: location&.id,
      reorder_point: point,
      reorder_quantity: quantity
    )
  end

  def adjust!(org_id, variant:, location:, quantity:)
    Inventory::RecordMovement.call(
      org_id: org_id,
      variant_id: variant.id,
      location_id: location.id,
      quantity_delta: quantity
    )
  end

  it "rejects unauthenticated access" do
    get "/api/v1/stock_thresholds"
    expect(response).to have_http_status(:unauthorized)

    get "/api/v1/stock_thresholds/low_stock"
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /stock_thresholds" do
    it "returns the org's thresholds with decimals as strings" do
      token, org_id = start_session!
      variant = create_variant!(org_id, sku: "SKU-1")
      shop = create_location!(org_id, name: "Shop")
      create_threshold!(org_id, variant: variant, point: "12.5", location: shop, quantity: "50")

      get "/api/v1/stock_thresholds", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("stock_thresholds")
      expect(rows.size).to eq(1)
      expect(rows.first).to include(
        "org_id" => org_id,
        "variant_id" => variant.id,
        "location_id" => shop.id,
        "reorder_point" => "12.5",
        "reorder_quantity" => "50.0"
      )
    end

    it "filters by variant" do
      token, org_id = start_session!
      wanted = create_variant!(org_id, sku: "SKU-WANTED")
      other = create_variant!(org_id, sku: "SKU-OTHER")
      create_threshold!(org_id, variant: wanted, point: "5")
      create_threshold!(org_id, variant: other, point: "7")

      get "/api/v1/stock_thresholds?variant_id=#{wanted.id}", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("stock_thresholds")
      expect(rows.map { |row| row.fetch("variant_id") }).to eq([wanted.id])
    end

    # The variant-wide default is what applies at a location with no row of its own, so a
    # location-filtered read has to carry it too.
    it "returns the variant-wide default alongside the location's own row and drops other locations" do
      token, org_id = start_session!
      variant = create_variant!(org_id, sku: "SKU-1")
      shop = create_location!(org_id, name: "Shop")
      warehouse = create_location!(org_id, name: "Warehouse", type: "warehouse")
      create_threshold!(org_id, variant: variant, point: "5")
      create_threshold!(org_id, variant: variant, point: "20", location: shop)
      create_threshold!(org_id, variant: variant, point: "99", location: warehouse)

      get "/api/v1/stock_thresholds?location_id=#{shop.id}", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("stock_thresholds")
      expect(rows.map { |row| row.fetch("location_id") }).to contain_exactly(nil, shop.id)
    end

    it "does not leak another org's thresholds" do
      token, org_id = start_session!
      variant = create_variant!(org_id, sku: "SKU-MINE")
      create_threshold!(org_id, variant: variant, point: "5")

      rival = Organization.create!(name: "Rival")
      rival_variant = create_variant!(rival.id, sku: "SKU-RIVAL")
      create_threshold!(rival.id, variant: rival_variant, point: "100")

      get "/api/v1/stock_thresholds", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("stock_thresholds")
      expect(rows.map { |row| row.fetch("variant_id") }).to eq([variant.id])
    end
  end

  describe "GET /stock_thresholds/low_stock" do
    it "reports what is at or below its reorder point, worst shortfall first" do
      token, org_id = start_session!
      shop = create_location!(org_id, name: "Shop")
      empty = create_variant!(org_id, sku: "SKU-EMPTY")
      low = create_variant!(org_id, sku: "SKU-LOW")
      stocked = create_variant!(org_id, sku: "SKU-STOCKED")
      create_threshold!(org_id, variant: empty, point: "10", quantity: "40")
      create_threshold!(org_id, variant: low, point: "10")
      create_threshold!(org_id, variant: stocked, point: "2")
      adjust!(org_id, variant: empty, location: shop, quantity: "1")
      adjust!(org_id, variant: low, location: shop, quantity: "9")
      adjust!(org_id, variant: stocked, location: shop, quantity: "50")

      get "/api/v1/stock_thresholds/low_stock", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("low_stock")
      expect(rows.map { |row| row.fetch("variant_id") }).to eq([empty.id, low.id])
      expect(rows.first).to include(
        "location_id" => shop.id,
        "on_hand" => "1.0",
        "reorder_point" => "10.0",
        "reorder_quantity" => "40.0",
        "shortfall" => "9.0"
      )
    end

    it "reports nothing for a variant with no threshold, however low it is" do
      token, org_id = start_session!
      shop = create_location!(org_id, name: "Shop")
      variant = create_variant!(org_id, sku: "SKU-1")
      adjust!(org_id, variant: variant, location: shop, quantity: "-4")

      get "/api/v1/stock_thresholds/low_stock", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).fetch("low_stock")).to be_empty
    end

    it "filters to one location and still honours the variant-wide default there" do
      token, org_id = start_session!
      shop = create_location!(org_id, name: "Shop")
      warehouse = create_location!(org_id, name: "Warehouse", type: "warehouse")
      variant = create_variant!(org_id, sku: "SKU-1")
      create_threshold!(org_id, variant: variant, point: "5")
      adjust!(org_id, variant: variant, location: shop, quantity: "1")
      adjust!(org_id, variant: variant, location: warehouse, quantity: "2")

      get "/api/v1/stock_thresholds/low_stock?location_id=#{warehouse.id}", headers: auth_headers(token)
      expect(response).to have_http_status(:ok)

      rows = JSON.parse(response.body).fetch("low_stock")
      expect(rows.map { |row| row.fetch("location_id") }).to eq([warehouse.id])
      expect(rows.first.fetch("on_hand")).to eq("2.0")
    end
  end
end
