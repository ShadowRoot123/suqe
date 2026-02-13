module Api
  module V1
    class PurchaseReceiptItemsController < ApplicationController
      before_action :authenticate!
      before_action :load_receipt

      def index
        require_permission!("purchasing.read")
        return if performed?

        items = @receipt.purchase_receipt_items.order(:id)
        render json: { purchase_receipt_items: items.map { |item| item.slice(:id, :receipt_id, :variant_id, :quantity_received, :unit_cost) } }
      end

      private

      def load_receipt
        @receipt = PurchaseReceipt.find_by!(id: params[:purchase_receipt_id], org_id: current_organization.id)
      end
    end
  end
end

