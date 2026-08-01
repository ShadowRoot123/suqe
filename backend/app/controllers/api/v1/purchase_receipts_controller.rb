module Api
  module V1
    class PurchaseReceiptsController < ApplicationController
      # Receiving here and receiving arriving on the sync pipeline both go through
      # Purchasing::ReceiveOrder, so the lifecycle guards, the over-receipt rule and the ledger
      # writes cannot drift between the two surfaces. This controller used to set the order's
      # status itself and hand-roll the snapshot upsert, which let it walk a draft straight to
      # `received`.
      ARGUMENT_ERROR_CODES = {
        "Invalid purchase order" => "invalid_purchase_order",
        "Missing field: purchase_order_id" => "invalid_purchase_order"
      }.freeze

      before_action :authenticate!
      before_action :load_receipt, only: %i[show]

      # One handler rather than two declarations, because InvalidTransition is an ArgumentError
      # and which of two rescue_from blocks wins would come down to declaration order.
      rescue_from ArgumentError do |error|
        if error.is_a?(Purchasing::OrderLifecycle::InvalidTransition)
          render_error(code: "invalid_transition", message: error.message, status: :conflict)
        else
          render_error(
            code: ARGUMENT_ERROR_CODES.fetch(error.message, "invalid_request"),
            message: error.message,
            status: :unprocessable_entity
          )
        end
      end

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

        attrs = receipt_params
        receipt = Purchasing::ReceiveOrder.call(
          org_id: current_organization.id,
          id: attrs[:id],
          purchase_order_id: attrs[:purchase_order_id],
          received_at: attrs[:received_at],
          items: attrs[:items],
          received_by: current_user.id,
          idempotency_key: attrs[:idempotency_key]
        )

        render json: { purchase_receipt: receipt_payload(receipt, include_items: true) }, status: :created
      end

      private

      def load_receipt
        @receipt = PurchaseReceipt.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def receipt_params
        params
          .require(:purchase_receipt)
          .permit(:id, :purchase_order_id, :received_at, :idempotency_key,
                  items: %i[id variant_id quantity_received unit_cost])
          .to_h
          .symbolize_keys
      end

      def receipt_payload(receipt, include_items: false)
        payload = receipt.slice(:id, :org_id, :purchase_order_id, :received_at, :received_by, :created_at, :idempotency_key)
        if include_items
          payload[:items] = Purchasing::ReceiptLines.payload(receipt)
          # The receipt is what settled the order's status, so callers do not need a second
          # request to find out what it settled on.
          payload[:purchase_order_status] = receipt.purchase_order.status
        end
        payload
      end
    end
  end
end
