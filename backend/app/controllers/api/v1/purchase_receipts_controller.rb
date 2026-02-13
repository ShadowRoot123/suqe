module Api
  module V1
    class PurchaseReceiptsController < ApplicationController
      before_action :authenticate!
      before_action :load_receipt, only: %i[show]

      def index
        require_permission!("purchasing.read")
        return if performed?

        receipts = PurchaseReceipt.where(org_id: current_organization.id).order(created_at: :desc)
        receipts = receipts.where(purchase_order_id: params[:purchase_order_id]) if params[:purchase_order_id].present?
        render json: { purchase_receipts: receipts.limit(200).map { |r| receipt_payload(r) } }
      end

      def show
        require_permission!("purchasing.read")
        return if performed?

        render json: { purchase_receipt: receipt_payload(@receipt, include_items: true) }
      end

      def create
        require_permission!("purchasing.receive")
        return if performed?

        attrs = receipt_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact

        purchase_order_id = attrs.fetch("purchase_order_id") { attrs.fetch(:purchase_order_id) }
        purchase_order = PurchaseOrder.find_by(id: purchase_order_id, org_id: current_organization.id)
        return render_error(code: "invalid_purchase_order", message: "Invalid purchase order", status: :unprocessable_entity) if purchase_order.blank?

        receipt = nil
        PurchaseReceipt.transaction do
          receipt = PurchaseReceipt.create!(
            attrs.merge(
              org_id: current_organization.id,
              received_by: current_user.id,
              purchase_order_id: purchase_order.id
            )
          )

          items.each do |item|
            item_hash = item.to_h
            variant_id = item_hash.fetch("variant_id") { item_hash.fetch(:variant_id) }
            return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

            PurchaseReceiptItem.create!(
              receipt_id: receipt.id,
              variant_id: variant_id,
              quantity_received: item_hash.fetch("quantity_received") { item_hash.fetch(:quantity_received) },
              unit_cost: item_hash.fetch("unit_cost") { item_hash.fetch(:unit_cost) }
            )

            InventoryMovement.create!(
              org_id: current_organization.id,
              variant_id: variant_id,
              location_id: purchase_order.location_id,
              type: "purchase",
              quantity_delta: item_hash.fetch("quantity_received") { item_hash.fetch(:quantity_received) },
              reference_type: "PurchaseReceipt",
              reference_id: receipt.id,
              created_by: current_user.id,
              note: "Purchase receipt"
            )

            connection = ActiveRecord::Base.connection
            connection.execute <<~SQL
              INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
              VALUES (gen_random_uuid(), #{connection.quote(current_organization.id)}, #{connection.quote(variant_id)}, #{connection.quote(purchase_order.location_id)}, #{connection.quote(item_hash.fetch("quantity_received") { item_hash.fetch(:quantity_received) })}, now())
              ON CONFLICT (org_id, variant_id, location_id)
              DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                           updated_at = now();
            SQL
          end

          update_purchase_order_receipt_status!(purchase_order)
        end

        render json: { purchase_receipt: receipt_payload(receipt, include_items: true) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      private

      def load_receipt
        @receipt = PurchaseReceipt.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def receipt_params
        params.require(:purchase_receipt).permit(:purchase_order_id, :received_at, :idempotency_key, items: %i[variant_id quantity_received unit_cost])
      end

      def update_purchase_order_receipt_status!(purchase_order)
        ordered_by_variant = PurchaseItem.where(purchase_order_id: purchase_order.id).group(:variant_id).sum(:quantity_ordered)
        return if ordered_by_variant.empty?

        received_by_variant = PurchaseReceiptItem.joins("INNER JOIN purchase_receipts ON purchase_receipts.id = purchase_receipt_items.receipt_id")
                                                 .where(purchase_receipts: { purchase_order_id: purchase_order.id })
                                                 .group(:variant_id)
                                                 .sum(:quantity_received)

        all_received = ordered_by_variant.all? do |variant_id, ordered_qty|
          received_by_variant.fetch(variant_id, 0).to_d >= ordered_qty.to_d
        end

        purchase_order.update!(status: all_received ? "received" : "partially_received")
      end

      def receipt_payload(receipt, include_items: false)
        payload = receipt.slice(:id, :org_id, :purchase_order_id, :received_at, :received_by, :created_at, :idempotency_key)
        if include_items
          payload[:items] = receipt.purchase_receipt_items.order(:id).map do |item|
            item.slice(:id, :receipt_id, :variant_id, :quantity_received, :unit_cost)
          end
        end
        payload
      end
    end
  end
end

