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
