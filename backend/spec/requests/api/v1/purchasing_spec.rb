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

  # Writes on this surface go through the same Purchasing:: services the sync pipeline uses, so
  # the lifecycle guards have to show up here too rather than only on the offline path.
  describe "purchase order lifecycle over REST" do
    def start_session!
      session = create_org_and_get_token!(permission_keys: permission_keys)
      org_id = session.fetch(:org_id)
      product = Product.create!(org_id: org_id, name: "Coffee")
      {
        auth: auth_headers(session.fetch(:token)),
        org_id: org_id,
        supplier: Supplier.create!(org_id: org_id, name: "Acme"),
        location: Location.create!(org_id: org_id, name: "Shop", type: "shop"),
        variant: Variant.create!(org_id: org_id, product_id: product.id, sku: "SKU-REST-1", attrs: {})
      }
    end

    def post_order!(session, items: nil, status: nil)
      body = { supplier_id: session[:supplier].id, location_id: session[:location].id }
      body[:items] = items if items
      body[:status] = status if status

      post "/api/v1/purchase_orders", params: { purchase_order: body }, headers: session[:auth], as: :json
      JSON.parse(response.body)
    end

    def one_line(session, quantity: "4", cost: "2.50")
      [{ variant_id: session[:variant].id, quantity_ordered: quantity, unit_cost: cost }]
    end

    it "derives the total from the lines instead of trusting the caller" do
      session = start_session!
      body = post_order!(session, items: one_line(session))

      expect(response).to have_http_status(:created)
      expect(body.dig("purchase_order", "status")).to eq("draft")
      expect(body.dig("purchase_order", "total_cost")).to eq("10.0")
    end

    it "approves a draft that has lines" do
      session = start_session!
      order_id = post_order!(session, items: one_line(session)).dig("purchase_order", "id")

      patch "/api/v1/purchase_orders/#{order_id}",
            params: { purchase_order: { status: "approved" } }, headers: session[:auth], as: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig("purchase_order", "status")).to eq("approved")
    end

    it "refuses to receive against a draft" do
      session = start_session!
      order_id = post_order!(session, items: one_line(session)).dig("purchase_order", "id")

      patch "/api/v1/purchase_orders/#{order_id}",
            params: { purchase_order: { status: "received" } }, headers: session[:auth], as: :json

      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_transition")
      expect(PurchaseOrder.find(order_id).status).to eq("draft")
    end

    it "refuses to approve an order with no lines" do
      session = start_session!
      order_id = post_order!(session).dig("purchase_order", "id")

      patch "/api/v1/purchase_orders/#{order_id}",
            params: { purchase_order: { status: "approved" } }, headers: session[:auth], as: :json

      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body).fetch("message")).to match(/at least one line/)
    end

    it "refuses to edit the lines of an approved order" do
      session = start_session!
      order_id = post_order!(session, items: one_line(session), status: "approved").dig("purchase_order", "id")
      expect(PurchaseOrder.find(order_id).status).to eq("approved")

      patch "/api/v1/purchase_orders/#{order_id}",
            params: { purchase_order: { items: one_line(session, quantity: "99") } },
            headers: session[:auth], as: :json

      expect(response).to have_http_status(:conflict)
      expect(PurchaseOrder.find(order_id).purchase_items.first.quantity_ordered).to eq(4.to_d)
    end

    it "deletes a draft but not an approved order" do
      session = start_session!
      draft_id = post_order!(session, items: one_line(session)).dig("purchase_order", "id")
      approved_id = post_order!(session, items: one_line(session), status: "approved").dig("purchase_order", "id")

      delete "/api/v1/purchase_orders/#{draft_id}", headers: session[:auth], as: :json
      expect(response).to have_http_status(:no_content)

      delete "/api/v1/purchase_orders/#{approved_id}", headers: session[:auth], as: :json
      expect(response).to have_http_status(:conflict)
      expect(PurchaseOrder.find_by(id: approved_id)).to be_present
    end

    it "rejects a line whose variant belongs to another org" do
      session = start_session!
      rival = Organization.create!(name: "Rival")
      rival_product = Product.create!(org_id: rival.id, name: "Rival Coffee")
      rival_variant = Variant.create!(org_id: rival.id, product_id: rival_product.id, sku: "SKU-RIVAL", attrs: {})

      post_order!(session, items: [{ variant_id: rival_variant.id, quantity_ordered: "1", unit_cost: "1" }])

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_variant")
      expect(PurchaseOrder.where(org_id: session[:org_id]).count).to eq(0)
    end

    it "filters the index by status and rejects a status that is not in the enum" do
      session = start_session!
      post_order!(session, items: one_line(session))
      approved_id = post_order!(session, items: one_line(session), status: "approved").dig("purchase_order", "id")

      get "/api/v1/purchase_orders?status=approved", headers: session[:auth], as: :json
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).fetch("purchase_orders").map { |po| po.fetch("id") }).to eq([approved_id])

      get "/api/v1/purchase_orders?status=shipped", headers: session[:auth], as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_status")
    end

    it "does not reach another org's order" do
      session = start_session!
      rival = Organization.create!(name: "Rival")
      rival_supplier = Supplier.create!(org_id: rival.id, name: "Rival Supply")
      rival_location = Location.create!(org_id: rival.id, name: "Rival Shop", type: "shop")
      rival_order = Purchasing::CreateOrder.call(
        org_id: rival.id, supplier_id: rival_supplier.id, location_id: rival_location.id
      )

      get "/api/v1/purchase_orders/#{rival_order.id}", headers: session[:auth], as: :json
      expect(response).to have_http_status(:not_found)
    end

    # purchase_orders.supplier_id is ON DELETE RESTRICT, and Postgres raises restrict_violation
    # (23001), which Rails does not map to InvalidForeignKey — this used to be a 500.
    it "refuses to delete a supplier the org has ordered from" do
      session = start_session!
      post_order!(session, items: one_line(session))

      delete "/api/v1/suppliers/#{session[:supplier].id}", headers: session[:auth], as: :json

      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body).fetch("code")).to eq("invalid_foreign_key")
      expect(Supplier.find_by(id: session[:supplier].id)).to be_present
    end
  end
end

