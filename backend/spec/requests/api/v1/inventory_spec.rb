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
end

