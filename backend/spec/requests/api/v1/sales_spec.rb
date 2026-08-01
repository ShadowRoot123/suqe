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

  # Selling over REST goes through the same Sales::CreateSale the sync pipeline uses, so the
  # invariants have to show up here too rather than only on the offline path.
  describe "checkout over REST" do
    def start_session!
      session = create_org_and_get_token!(permission_keys: permission_keys)
      org_id = session.fetch(:org_id)
      product = Product.create!(org_id: org_id, name: "Coffee")
      variant = Variant.create!(org_id: org_id, product_id: product.id, sku: "SKU-POS-1", attrs: {}, price: "10.00")
      location = Location.create!(org_id: org_id, name: "Shop", type: "shop")
      Inventory::RecordMovement.call(
        org_id: org_id, variant_id: variant.id, location_id: location.id,
        quantity_delta: "10", type: "purchase", idempotency_key: "seed-pos"
      )

      { auth: auth_headers(session.fetch(:token)), org_id: org_id, product: product,
        variant: variant, location: location }
    end

    def post_sale!(session, items:, payments:, **overrides)
      body = { location_id: session[:location].id, items: items, payments: payments }.merge(overrides)
      post "/api/v1/sales", params: { sale: body }, headers: session[:auth], as: :json
      JSON.parse(response.body)
    end

    def on_hand(session)
      Inventory::OnHand.for(
        org_id: session[:org_id], variant_id: session[:variant].id, location_id: session[:location].id
      )
    end

    it "derives the totals from the lines instead of trusting the caller" do
      session = start_session!

      body = post_sale!(
        session,
        items: [{ variant_id: session[:variant].id, quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50" }],
        payments: [{ method: "cash", amount: "9.50" }]
      )

      expect(response).to have_http_status(:created)
      expect(body.dig("sale", "subtotal")).to eq("10.0")
      expect(body.dig("sale", "total_amount")).to eq("9.5")
      expect(on_hand(session)).to eq(8.to_d)
    end

    it "refuses a sale whose payments do not add up" do
      session = start_session!

      body = post_sale!(
        session,
        items: [{ variant_id: session[:variant].id, quantity: "1", unit_price: "10.00" }],
        payments: [{ method: "cash", amount: "5.00" }]
      )

      expect(response).to have_http_status(:unprocessable_entity)
      expect(body.fetch("message")).to match(/10.00 due, 5.00 paid/)
      # Nothing was written — this used to commit whatever had already landed before the error.
      expect(Sale.where(org_id: session[:org_id]).count).to eq(0)
      expect(on_hand(session)).to eq(10.to_d)
    end

    it "refuses to sell an archived product" do
      session = start_session!
      session[:product].update!(status: "archived")

      body = post_sale!(
        session,
        items: [{ variant_id: session[:variant].id, quantity: "1", unit_price: "10.00" }],
        payments: [{ method: "cash", amount: "10.00" }]
      )

      expect(response).to have_http_status(:unprocessable_entity)
      expect(body.fetch("message")).to match(/archived and cannot be sold/)
      expect(on_hand(session)).to eq(10.to_d)
    end

    it "returns the original sale when the same idempotency key is sent twice" do
      session = start_session!
      args = {
        items: [{ variant_id: session[:variant].id, quantity: "2", unit_price: "10.00" }],
        payments: [{ method: "cash", amount: "20.00" }],
        idempotency_key: "till-retry-1"
      }

      first = post_sale!(session, **args)
      second = post_sale!(session, **args)

      expect(second.dig("sale", "id")).to eq(first.dig("sale", "id"))
      expect(Sale.where(org_id: session[:org_id]).count).to eq(1)
      expect(on_hand(session)).to eq(8.to_d)
    end

    it "rejects a variant from another org" do
      session = start_session!
      rival = Organization.create!(name: "Rival")
      rival_product = Product.create!(org_id: rival.id, name: "Rival Coffee")
      rival_variant = Variant.create!(org_id: rival.id, product_id: rival_product.id, sku: "SKU-RIVAL", attrs: {})

      body = post_sale!(
        session,
        items: [{ variant_id: rival_variant.id, quantity: "1", unit_price: "1.00" }],
        payments: [{ method: "cash", amount: "1.00" }]
      )

      expect(response).to have_http_status(:unprocessable_entity)
      expect(body.fetch("code")).to eq("invalid_variant")
    end
  end
end

