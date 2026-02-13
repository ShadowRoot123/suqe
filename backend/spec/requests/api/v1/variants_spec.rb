require "rails_helper"

RSpec.describe "Variants", type: :request do
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

  def create_product!(token)
    post "/api/v1/products",
         params: { product: { name: "Coffee" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:created)
    JSON.parse(response.body).fetch("product").fetch("id")
  end

  it "rejects unauthenticated access" do
    get "/api/v1/variants"
    expect(response).to have_http_status(:unauthorized)
  end

  it "supports CRUD for variants" do
    token, _org_id = create_org_and_get_token!
    product_id = create_product!(token)

    post "/api/v1/variants",
         params: { variant: { product_id: product_id, sku: "SKU-001", barcode: "123", attrs: { size: "M" }, price: "10.50", cost_price: "7.25" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json

    expect(response).to have_http_status(:created)
    created = JSON.parse(response.body).fetch("variant")
    expect(created.fetch("product_id")).to eq(product_id)
    expect(created.fetch("sku")).to eq("SKU-001")
    variant_id = created.fetch("id")

    get "/api/v1/variants",
        headers: { "Authorization" => "Bearer #{token}" },
        as: :json
    expect(response).to have_http_status(:ok)
    list = JSON.parse(response.body).fetch("variants")
    expect(list.map { |v| v.fetch("id") }).to include(variant_id)

    get "/api/v1/variants", params: { product_id: product_id },
                             headers: { "Authorization" => "Bearer #{token}" }
    expect(response).to have_http_status(:ok)
    filtered = JSON.parse(response.body).fetch("variants")
    expect(filtered.map { |v| v.fetch("id") }).to include(variant_id)

    patch "/api/v1/variants/#{variant_id}",
          params: { variant: { sku: "SKU-002", attrs: { size: "L" } } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json
    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("variant")
    expect(updated.fetch("sku")).to eq("SKU-002")
    expect(updated.fetch("attrs")).to eq({ "size" => "L" })

    delete "/api/v1/variants/#{variant_id}",
           headers: { "Authorization" => "Bearer #{token}" },
           as: :json
    expect(response).to have_http_status(:no_content)
  end

  it "validates product ownership on create" do
    token, _org_id = create_org_and_get_token!

    post "/api/v1/variants",
         params: { variant: { product_id: "00000000-0000-0000-0000-000000000000", sku: "SKU-001" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    body = JSON.parse(response.body)
    expect(body.fetch("code")).to eq("invalid_product")
  end

  it "returns not_unique for duplicate SKU within org" do
    token, _org_id = create_org_and_get_token!
    product_id = create_product!(token)

    post "/api/v1/variants",
         params: { variant: { product_id: product_id, sku: "SKU-001" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:created)

    post "/api/v1/variants",
         params: { variant: { product_id: product_id, sku: "SKU-001" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:conflict)
    body = JSON.parse(response.body)
    expect(body.fetch("code")).to eq("not_unique")
  end
end

