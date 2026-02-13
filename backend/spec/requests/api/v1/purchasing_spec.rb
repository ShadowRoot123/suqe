require "rails_helper"

RSpec.describe "Purchasing", type: :request do
  let(:permission_keys) do
    %w[
      purchasing.read
      purchasing.write
      purchasing.receive
      catalog.write
      locations.write
    ]
  end

  before { skip_if_no_db! }

  it "creates purchase order and receipt" do
    session = create_org_and_get_token!(permission_keys: permission_keys)
    token = session.fetch(:token)
    auth = auth_headers(token)

    post "/api/v1/locations",
         params: { location: { name: "Shop", type: "shop" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    location_id = JSON.parse(response.body).dig("location", "id")

    post "/api/v1/suppliers",
         params: { supplier: { name: "Acme" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    supplier_id = JSON.parse(response.body).dig("supplier", "id")

    post "/api/v1/products",
         params: { product: { name: "Coffee" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    product_id = JSON.parse(response.body).dig("product", "id")

    post "/api/v1/variants",
         params: { variant: { product_id: product_id, sku: "SKU-PO-1", attrs: {}, price: "10.00", cost_price: "5.00" } },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    variant_id = JSON.parse(response.body).dig("variant", "id")

    post "/api/v1/purchase_orders",
         params: {
           purchase_order: {
             supplier_id: supplier_id,
             location_id: location_id,
             status: "draft",
             items: [{ variant_id: variant_id, quantity_ordered: "2", unit_cost: "5.00" }]
           }
         },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)
    purchase_order = JSON.parse(response.body).fetch("purchase_order")
    purchase_order_id = purchase_order.fetch("id")
    expect(purchase_order.fetch("items").length).to eq(1)

    post "/api/v1/purchase_receipts",
         params: {
           purchase_receipt: {
             purchase_order_id: purchase_order_id,
             items: [{ variant_id: variant_id, quantity_received: "2", unit_cost: "5.00" }]
           }
         },
         headers: auth,
         as: :json
    expect(response).to have_http_status(:created)

    get "/api/v1/purchase_orders/#{purchase_order_id}", headers: auth, as: :json
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).dig("purchase_order", "status")).to eq("received")
  end
end

