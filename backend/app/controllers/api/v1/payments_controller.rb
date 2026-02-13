module Api
  module V1
    class PaymentsController < ApplicationController
      before_action :authenticate!
      before_action :load_sale

      def index
        require_permission!("reports.view")
        return if performed?

        payments = @sale.payments.order(:id)
        render json: { payments: payments.map { |p| p.slice(:id, :sale_id, :method, :amount, :reference, :paid_at) } }
      end

      private

      def load_sale
        @sale = Sale.find_by!(id: params[:sale_id], org_id: current_organization.id)
      end
    end
  end
end

