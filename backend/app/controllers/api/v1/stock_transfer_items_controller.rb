module Api
  module V1
    class StockTransferItemsController < ApplicationController
      before_action :authenticate!
      before_action :load_transfer
      before_action :load_item, only: %i[update destroy]

      def index
        require_permission!("transfers.create")
        return if performed?

        items = @transfer.stock_transfer_items.order(:id)
        render json: { stock_transfer_items: items.map { |i| item_payload(i) } }
      end

      def create
        require_permission!("transfers.create")
        return if performed?

        attrs = item_params
        variant_id = attrs.fetch(:variant_id)
        return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

        item = StockTransferItem.create!(attrs.merge(transfer_id: @transfer.id))
        render json: { stock_transfer_item: item_payload(item) }, status: :created
      end

      def update
        require_permission!("transfers.create")
        return if performed?

        attrs = item_params
        if attrs.key?(:variant_id)
          variant_id = attrs[:variant_id]
          return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?
        end

        @item.update!(attrs)
        render json: { stock_transfer_item: item_payload(@item) }
      end

      def destroy
        require_permission!("transfers.create")
        return if performed?

        @item.destroy!
        head :no_content
      end

      private

      def load_transfer
        @transfer = StockTransfer.find_by!(id: params[:stock_transfer_id], org_id: current_organization.id)
      end

      def load_item
        @item = StockTransferItem.find_by!(id: params[:id], transfer_id: @transfer.id)
      end

      def item_params
        item = params.require(:stock_transfer_item).permit(:variant_id, :quantity)
        item.require(:variant_id) if action_name == "create"
        item.require(:quantity) if action_name == "create"
        item
      end

      def item_payload(item)
        item.slice(:id, :transfer_id, :variant_id, :quantity)
      end
    end
  end
end

