require "rails_helper"

RSpec.describe "Categories", type: :request do
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
    get "/api/v1/categories"
    expect(response).to have_http_status(:unauthorized)
  end

  it "supports CRUD for categories" do
    token, org_id = create_org_and_get_token!

    post "/api/v1/categories",
         params: { category: { name: "Beverages" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json

    expect(response).to have_http_status(:created)
    created = JSON.parse(response.body).fetch("category")
    expect(created.fetch("org_id")).to eq(org_id)
    expect(created.fetch("name")).to eq("Beverages")
    category_id = created.fetch("id")

    get "/api/v1/categories",
        headers: { "Authorization" => "Bearer #{token}" },
        as: :json

    expect(response).to have_http_status(:ok)
    list = JSON.parse(response.body).fetch("categories")
    expect(list.map { |c| c.fetch("id") }).to include(category_id)

    patch "/api/v1/categories/#{category_id}",
          params: { category: { name: "Hot Beverages" } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json

    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("category")
    expect(updated.fetch("name")).to eq("Hot Beverages")

    delete "/api/v1/categories/#{category_id}",
           headers: { "Authorization" => "Bearer #{token}" },
           as: :json

    expect(response).to have_http_status(:no_content)
  end

  it "validates parent ownership and self-parent on update" do
    token, _org_id = create_org_and_get_token!

    post "/api/v1/categories",
         params: { category: { name: "Beverages" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    category_id = JSON.parse(response.body).dig("category", "id")

    patch "/api/v1/categories/#{category_id}",
          params: { category: { parent_id: category_id } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body).fetch("code")).to eq("invalid_parent")

    patch "/api/v1/categories/#{category_id}",
          params: { category: { parent_id: "00000000-0000-0000-0000-000000000000" } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body).fetch("code")).to eq("invalid_parent")
  end
end

