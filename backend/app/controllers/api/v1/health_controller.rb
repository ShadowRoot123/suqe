module Api
  module V1
    class HealthController < ApplicationController
      def show
        render json: { status: "ok", server_time: Time.current.iso8601, request_id: request.request_id }
      end
    end
  end
end
