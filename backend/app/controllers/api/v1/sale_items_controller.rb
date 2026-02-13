module Api
  module V1
    class SaleItemsController < ApplicationController
      before_action :authenticate!
      before_action :load_sale

      def index
        require_permission!("reports.view")
        return if performed?

        items = @sale.sale_items.order(:id)
        render json: { sale_items: items.map { |item| item.slice(:id, :sale_id, :variant_id, :quantity, :unit_price, :discount, :tax) } }
      end

      private

      def load_sale
        @sale = Sale.find_by!(id: params[:sale_id], org_id: current_organization.id)
      end
    end
  end
end

