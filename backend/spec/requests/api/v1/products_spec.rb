require "rails_helper"

RSpec.describe "Products", type: :request do
  let(:permission_keys) do
    %w[
      catalog.read
      catalog.write
    ]
  end

  before do
    ActiveRecord::Base.connection.execute("SELECT 1")
  rescue StandardError
    skip "Database not available"
  end

  def ensure_permissions!(keys)
    connection = ActiveRecord::Base.connection
    keys.each do |key|
      connection.execute <<~SQL
        INSERT INTO permissions (id, key)
        VALUES (gen_random_uuid(), #{connection.quote(key)})
        ON CONFLICT (key) DO NOTHING;
      SQL
    end
  end

  def create_org_and_get_token!
    ensure_permissions!(permission_keys)

    post "/api/v1/orgs", params: {
      name: "My Shop",
      owner: { name: "Owner", email: "owner@example.com", password: "secret123" }
    }, as: :json

    expect(response).to have_http_status(:created)
    body = JSON.parse(response.body)
    [body.fetch("access_token"), body.dig("organization", "id")]
  end

  it "rejects unauthenticated access" do
    get "/api/v1/products"
    expect(response).to have_http_status(:unauthorized)
  end

  it "supports CRUD for products" do
    token, org_id = create_org_and_get_token!

    post "/api/v1/products",
         params: { product: { name: "Coffee" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json

    expect(response).to have_http_status(:created)
    created = JSON.parse(response.body).fetch("product")
    expect(created.fetch("org_id")).to eq(org_id)
    expect(created.fetch("name")).to eq("Coffee")
    product_id = created.fetch("id")

    get "/api/v1/products",
        headers: { "Authorization" => "Bearer #{token}" },
        as: :json

    expect(response).to have_http_status(:ok)
    list = JSON.parse(response.body).fetch("products")
    expect(list.map { |p| p.fetch("id") }).to include(product_id)

    patch "/api/v1/products/#{product_id}",
          params: { product: { name: "Coffee Beans" } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json

    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("product")
    expect(updated.fetch("name")).to eq("Coffee Beans")

    delete "/api/v1/products/#{product_id}",
           headers: { "Authorization" => "Bearer #{token}" },
           as: :json

    expect(response).to have_http_status(:ok)
    archived = JSON.parse(response.body).fetch("product")
    expect(archived.fetch("status")).to eq("archived")
  end

  it "filters the index by status so archived products can be kept out of catalog listings" do
    token, _org_id = create_org_and_get_token!
    headers = { "Authorization" => "Bearer #{token}" }

    post "/api/v1/products", params: { product: { name: "Coffee" } }, headers: headers, as: :json
    active_id = JSON.parse(response.body).dig("product", "id")

    post "/api/v1/products", params: { product: { name: "Discontinued Tea" } }, headers: headers, as: :json
    archived_id = JSON.parse(response.body).dig("product", "id")
    delete "/api/v1/products/#{archived_id}", headers: headers, as: :json
    expect(response).to have_http_status(:ok)

    # No filter still returns everything — the admin list needs to see archived rows.
    get "/api/v1/products", headers: headers, as: :json
    expect(JSON.parse(response.body).fetch("products").map { |p| p.fetch("id") }).to contain_exactly(active_id, archived_id)

    get "/api/v1/products?status=active", headers: headers, as: :json
    expect(JSON.parse(response.body).fetch("products").map { |p| p.fetch("id") }).to eq([active_id])

    get "/api/v1/products?status=archived", headers: headers, as: :json
    expect(JSON.parse(response.body).fetch("products").map { |p| p.fetch("id") }).to eq([archived_id])
  end

  it "rejects an unknown status instead of silently ignoring it" do
    token, _org_id = create_org_and_get_token!
    headers = { "Authorization" => "Bearer #{token}" }

    get "/api/v1/products?status=inactive", headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body).fetch("code")).to eq("invalid_status")

    post "/api/v1/products", params: { product: { name: "Coffee", status: "inactive" } }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "validates category ownership on create" do
    token, _org_id = create_org_and_get_token!

    post "/api/v1/products",
         params: { product: { name: "Coffee", category_id: "00000000-0000-0000-0000-000000000000" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    body = JSON.parse(response.body)
    expect(body.fetch("code")).to eq("invalid_category")
  end
end
