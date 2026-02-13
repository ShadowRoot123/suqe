require "rails_helper"

RSpec.describe "Locations", type: :request do
  let(:permission_keys) do
    %w[
      locations.read
      locations.write
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
    get "/api/v1/locations"
    expect(response).to have_http_status(:unauthorized)
  end

  it "supports CRUD for locations" do
    token, org_id = create_org_and_get_token!

    post "/api/v1/locations",
         params: { location: { name: "Main Shop", type: "shop", address: "123 Street" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:created)
    created = JSON.parse(response.body).fetch("location")
    expect(created.fetch("org_id")).to eq(org_id)
    expect(created.fetch("type")).to eq("shop")
    location_id = created.fetch("id")

    get "/api/v1/locations",
        headers: { "Authorization" => "Bearer #{token}" },
        as: :json
    expect(response).to have_http_status(:ok)
    list = JSON.parse(response.body).fetch("locations")
    expect(list.map { |l| l.fetch("id") }).to include(location_id)

    patch "/api/v1/locations/#{location_id}",
          params: { location: { name: "Main Warehouse", type: "warehouse" } },
          headers: { "Authorization" => "Bearer #{token}" },
          as: :json
    expect(response).to have_http_status(:ok)
    updated = JSON.parse(response.body).fetch("location")
    expect(updated.fetch("name")).to eq("Main Warehouse")
    expect(updated.fetch("type")).to eq("warehouse")

    delete "/api/v1/locations/#{location_id}",
           headers: { "Authorization" => "Bearer #{token}" },
           as: :json
    expect(response).to have_http_status(:no_content)
  end

  it "returns not_unique for duplicate name within org" do
    token, _org_id = create_org_and_get_token!

    post "/api/v1/locations",
         params: { location: { name: "Main Shop", type: "shop" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:created)

    post "/api/v1/locations",
         params: { location: { name: "Main Shop", type: "shop" } },
         headers: { "Authorization" => "Bearer #{token}" },
         as: :json
    expect(response).to have_http_status(:conflict)
    body = JSON.parse(response.body)
    expect(body.fetch("code")).to eq("not_unique")
  end
end

