module Api
  module V1
    class PurchaseOrdersController < ApplicationController
      before_action :authenticate!
      before_action :load_purchase_order, only: %i[show update destroy]

      def index
        require_permission!("purchasing.read")
        return if performed?

        orders = PurchaseOrder.where(org_id: current_organization.id).order(created_at: :desc)
        orders = orders.where(status: params[:status]) if params[:status].present?
        render json: { purchase_orders: orders.limit(200).map { |po| purchase_order_payload(po) } }
      end

      def show
        require_permission!("purchasing.read")
        return if performed?

        render json: { purchase_order: purchase_order_payload(@purchase_order, include_items: true) }
      end

      def create
        require_permission!("purchasing.write")
        return if performed?

        attrs = purchase_order_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact

        supplier_id = attrs.fetch("supplier_id") { attrs.fetch(:supplier_id) }
        location_id = attrs.fetch("location_id") { attrs.fetch(:location_id) }
        return render_error(code: "invalid_supplier", message: "Invalid supplier", status: :unprocessable_entity) unless Supplier.where(org_id: current_organization.id, id: supplier_id).exists?
        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: location_id).exists?

        order = nil
        PurchaseOrder.transaction do
          order = PurchaseOrder.create!(
            attrs.merge(
              org_id: current_organization.id,
              created_by: current_user.id
            )
          )
          replace_items!(order, items) if items.any?
          order.update!(total_cost: compute_total_cost(order))
        end

        render json: { purchase_order: purchase_order_payload(order, include_items: true) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        require_permission!("purchasing.write")
        return if performed?

        attrs = purchase_order_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact

        if attrs.key?("supplier_id") || attrs.key?(:supplier_id)
          supplier_id = attrs["supplier_id"] || attrs[:supplier_id]
          return render_error(code: "invalid_supplier", message: "Invalid supplier", status: :unprocessable_entity) unless Supplier.where(org_id: current_organization.id, id: supplier_id).exists?
        end
        if attrs.key?("location_id") || attrs.key?(:location_id)
          location_id = attrs["location_id"] || attrs[:location_id]
          return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: location_id).exists?
        end

        PurchaseOrder.transaction do
          @purchase_order.update!(attrs)
          replace_items!(@purchase_order, items) if items.any?
          @purchase_order.update!(total_cost: compute_total_cost(@purchase_order))
        end

        render json: { purchase_order: purchase_order_payload(@purchase_order, include_items: true) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("purchasing.write")
        return if performed?

        @purchase_order.destroy!
        head :no_content
      rescue ActiveRecord::InvalidForeignKey
        render_error(code: "invalid_foreign_key", message: "Record is referenced by other records", status: :conflict)
      end

      private

      def load_purchase_order
        @purchase_order = PurchaseOrder.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def purchase_order_params
        params.require(:purchase_order).permit(:supplier_id, :location_id, :status, :expected_at, items: %i[variant_id quantity_ordered unit_cost])
      end

      def replace_items!(order, items)
        order.purchase_items.destroy_all
        items.each do |item|
          item_hash = item.to_h
          variant_id = item_hash.fetch("variant_id") { item_hash.fetch(:variant_id) }
          return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

          PurchaseItem.create!(
            purchase_order_id: order.id,
            variant_id: variant_id,
            quantity_ordered: item_hash.fetch("quantity_ordered") { item_hash.fetch(:quantity_ordered) },
            unit_cost: item_hash.fetch("unit_cost") { item_hash.fetch(:unit_cost) }
          )
        end
      end

      def compute_total_cost(order)
        order.purchase_items.sum("quantity_ordered * unit_cost")
      end

      def purchase_order_payload(order, include_items: false)
        payload = order.slice(:id, :org_id, :supplier_id, :location_id, :status, :expected_at, :total_cost, :created_by, :created_at, :updated_at)
        payload[:items] = order.purchase_items.order(:created_at).map { |item| item.slice(:id, :purchase_order_id, :variant_id, :quantity_ordered, :unit_cost, :created_at) } if include_items
        payload
      end
    end
  end
end

