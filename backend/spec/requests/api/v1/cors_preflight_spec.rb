require "rails_helper"

RSpec.describe "CORS preflight", type: :request do
  it "responds to OPTIONS /api/v1/orgs with CORS headers" do
    options "/api/v1/orgs", headers: {
      "Origin" => "http://localhost:19006",
      "Access-Control-Request-Method" => "POST",
      "Access-Control-Request-Headers" => "content-type"
    }

    expect([200, 204]).to include(response.status)
    expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:19006")
    expect(response.headers["Access-Control-Allow-Methods"]).to include("POST")
  end
end

