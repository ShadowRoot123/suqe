require "rails_helper"

RSpec.describe "Returns", type: :request do
  let(:permission_keys) { %w[pos.sell pos.refund reports.view catalog.write locations.write inventory.adjust inventory.read] }

  before { skip_if_no_db! }

  it "creates return with refund and restocks inventory" do
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
         params: { variant: { product_id: product_id, sku: "SKU-RET-1", attrs: {}, price: "10.00", cost_price: "5.00" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    variant_id = JSON.parse(response.body).dig("variant", "id")

    post "/api/v1/inventory_movements",
         params: { inventory_movement: { variant_id: variant_id, location_id: location_id, quantity_delta: "2", note: "Stock" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)

    post "/api/v1/sales",
         params: {
           sale: {
             location_id: location_id,
             items: [{ variant_id: variant_id, quantity: "1", unit_price: "10.00", discount: "0", tax: "0" }],
             payments: [{ method: "cash", amount: "10.00" }]
           }
         },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    sale_id = JSON.parse(response.body).dig("sale", "id")
    sale_item_id = JSON.parse(response.body).dig("sale", "items", 0, "id")

    post "/api/v1/returns",
         params: {
           return: {
             sale_id: sale_id,
             location_id: location_id,
             items: [{ sale_item_id: sale_item_id, quantity: "1", restockable: true }],
             refund: { method: "cash", amount: "10.00" }
           }
         },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)

    get "/api/v1/inventory_snapshots?variant_id=#{variant_id}&location_id=#{location_id}", headers: auth
    expect(response).to have_http_status(:ok)
    qty = JSON.parse(response.body).fetch("inventory_snapshots").first.fetch("quantity").to_d
    expect(qty).to eq(2.to_d)
  end
end

