module Api
  module V1
    class PurchaseItemsController < ApplicationController
      before_action :authenticate!
      before_action :load_purchase_order
      before_action :load_purchase_item, only: %i[update destroy]

      def index
        require_permission!("purchasing.read")
        return if performed?

        items = @purchase_order.purchase_items.order(created_at: :asc)
        render json: { purchase_items: items.map { |item| item_payload(item) } }
      end

      def create
        require_permission!("purchasing.write")
        return if performed?

        attrs = purchase_item_params
        variant_id = attrs.fetch(:variant_id)
        return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

        item = PurchaseItem.create!(attrs.merge(purchase_order_id: @purchase_order.id))
        @purchase_order.update!(total_cost: @purchase_order.purchase_items.sum("quantity_ordered * unit_cost"))

        render json: { purchase_item: item_payload(item) }, status: :created
      end

      def update
        require_permission!("purchasing.write")
        return if performed?

        attrs = purchase_item_params
        if attrs.key?(:variant_id)
          variant_id = attrs[:variant_id]
          return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?
        end

        @purchase_item.update!(attrs)
        @purchase_order.update!(total_cost: @purchase_order.purchase_items.sum("quantity_ordered * unit_cost"))

        render json: { purchase_item: item_payload(@purchase_item) }
      end

      def destroy
        require_permission!("purchasing.write")
        return if performed?

        @purchase_item.destroy!
        @purchase_order.update!(total_cost: @purchase_order.purchase_items.sum("quantity_ordered * unit_cost"))
        head :no_content
      end

      private

      def load_purchase_order
        @purchase_order = PurchaseOrder.find_by!(id: params[:purchase_order_id], org_id: current_organization.id)
      end

      def load_purchase_item
        @purchase_item = PurchaseItem.find_by!(id: params[:id], purchase_order_id: @purchase_order.id)
      end

      def purchase_item_params
        item = params.require(:purchase_item).permit(:variant_id, :quantity_ordered, :unit_cost)
        item.require(:variant_id) if action_name == "create"
        item.require(:quantity_ordered) if action_name == "create"
        item.require(:unit_cost) if action_name == "create"
        item
      end

      def item_payload(item)
        item.slice(:id, :purchase_order_id, :variant_id, :quantity_ordered, :unit_cost, :created_at)
      end
    end
  end
end

