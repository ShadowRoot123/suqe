require "rails_helper"

RSpec.describe "Sales", type: :request do
  let(:permission_keys) { %w[pos.sell reports.view catalog.write locations.write inventory.adjust] }

  before { skip_if_no_db! }

  it "creates sale and reads items/payments" do
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
         params: { variant: { product_id: product_id, sku: "SKU-SALE-1", attrs: {}, price: "10.00", cost_price: "5.00" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    variant_id = JSON.parse(response.body).dig("variant", "id")

    post "/api/v1/inventory_movements",
         params: { inventory_movement: { variant_id: variant_id, location_id: location_id, quantity_delta: "5", note: "Stock" } },
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
    sale = JSON.parse(response.body).fetch("sale")
    sale_id = sale.fetch("id")

    get "/api/v1/sales/#{sale_id}", headers: auth, as: :json
    expect(response).to have_http_status(:ok)
    shown = JSON.parse(response.body).fetch("sale")
    expect(shown.fetch("items").length).to eq(1)
    expect(shown.fetch("payments").length).to eq(1)

    get "/api/v1/sales/#{sale_id}/sale_items", headers: auth, as: :json
    expect(response).to have_http_status(:ok)

    get "/api/v1/sales/#{sale_id}/payments", headers: auth, as: :json
    expect(response).to have_http_status(:ok)
  end
end

