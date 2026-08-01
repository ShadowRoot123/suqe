module Api
  module V1
    class SalesController < ApplicationController
      # Selling here and selling arriving on the sync pipeline both go through Sales::CreateSale,
      # so the totals, the payment invariant, the archived-item guard and the ledger writes cannot
      # drift between the two surfaces. This controller used to derive its own totals and
      # hand-roll the snapshot upsert, and its `return render_error` inside the transaction block
      # committed whatever had already been written.
      ARGUMENT_ERROR_CODES = {
        "Invalid location" => "invalid_location",
        "Missing field: location_id" => "invalid_location",
        "Invalid variant" => "invalid_variant",
        "A sale needs at least one line" => "items_required",
        "A sale needs at least one payment" => "payments_required"
      }.freeze

      before_action :authenticate!
      before_action :load_sale, only: %i[show]

      rescue_from ArgumentError do |error|
        render_error(
          code: ARGUMENT_ERROR_CODES.fetch(error.message, "invalid_request"),
          message: error.message,
          status: :unprocessable_entity
        )
      end

      def index
        require_permission!("reports.view")
        return if performed?

        sales = Sale.where(org_id: current_organization.id).order(sold_at: :desc)
        sales = sales.where(location_id: params[:location_id]) if params[:location_id].present?
        render json: { sales: sales.limit(200).map { |sale| sale_payload(sale) } }
      end

      def show
        require_permission!("reports.view")
        return if performed?

        render json: { sale: sale_payload(@sale, include_items: true, include_payments: true) }
      end

      def create
        require_permission!("pos.sell")
        return if performed?

        attrs = sale_params
        sale = Sales::CreateSale.call(
          org_id: current_organization.id,
          id: attrs[:id],
          location_id: attrs[:location_id],
          sold_at: attrs[:sold_at],
          items: attrs[:items],
          payments: attrs[:payments],
          cashier_id: current_user.id,
          idempotency_key: attrs[:idempotency_key]
        )

        render json: { sale: sale_payload(sale, include_items: true, include_payments: true) }, status: :created
      end

      private

      def load_sale
        @sale = Sale.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def sale_params
        params
          .require(:sale)
          .permit(
            :id,
            :location_id,
            :sold_at,
            :idempotency_key,
            items: %i[id variant_id quantity unit_price discount tax],
            payments: %i[id method amount reference paid_at]
          )
          .to_h
          .symbolize_keys
      end

      def sale_payload(sale, include_items: false, include_payments: false)
        payload = sale.slice(:id, :org_id, :location_id, :cashier_id, :status, :subtotal, :tax, :discount, :total_amount, :sold_at, :created_at, :idempotency_key)
        payload[:items] = Sales::SaleLines.payload(sale) if include_items
        payload[:payments] = Sales::SalePayments.payload(sale) if include_payments
        payload
      end
    end
  end
end
