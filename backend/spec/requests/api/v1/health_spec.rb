require "rails_helper"

RSpec.describe "GET /api/v1/health", type: :request do
  it "returns ok" do
    get "/api/v1/health"

    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body).to include("status" => "ok")
    expect(body.fetch("server_time")).to be_a(String)
    expect(body.fetch("request_id")).to be_a(String)
    expect(response.headers.fetch("X-Request-Id")).to be_a(String)
  end
end
