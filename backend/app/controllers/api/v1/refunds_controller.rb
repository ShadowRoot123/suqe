module Api
  module V1
    class RefundsController < ApplicationController
      before_action :authenticate!
      before_action :load_return

      def index
        require_permission!("reports.view")
        return if performed?

        refunds = @return.refunds.order(:id)
        render json: { refunds: refunds.map { |r| r.slice(:id, :return_id, :method, :amount, :refunded_at) } }
      end

      private

      def load_return
        @return = Return.find_by!(id: params[:return_id], org_id: current_organization.id)
      end
    end
  end
end

