module Api
  module V1
    class SalesController < ApplicationController
      before_action :authenticate!
      before_action :load_sale, only: %i[show]

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

        attrs = sale_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact
        payments = Array(attrs.delete("payments") || attrs.delete(:payments)).compact

        location_id = attrs.fetch("location_id") { attrs.fetch(:location_id) }
        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: location_id).exists?
        return render_error(code: "items_required", message: "Items required", status: :unprocessable_entity) if items.empty?

        sale = nil
        Sale.transaction do
          totals = compute_sale_totals(items)
          sale = Sale.create!(
            attrs.merge(
              org_id: current_organization.id,
              cashier_id: current_user.id,
              status: "completed",
              subtotal: totals.fetch(:subtotal),
              tax: totals.fetch(:tax),
              discount: totals.fetch(:discount),
              total_amount: totals.fetch(:total_amount)
            )
          )

          items.each do |item|
            h = item.to_h
            variant_id = h.fetch("variant_id") { h.fetch(:variant_id) }
            return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

            SaleItem.create!(
              sale_id: sale.id,
              variant_id: variant_id,
              quantity: h.fetch("quantity") { h.fetch(:quantity) },
              unit_price: h.fetch("unit_price") { h.fetch(:unit_price) },
              discount: h["discount"] || h[:discount] || 0,
              tax: h["tax"] || h[:tax] || 0
            )

            qty = h.fetch("quantity") { h.fetch(:quantity) }
            InventoryMovement.create!(
              org_id: current_organization.id,
              variant_id: variant_id,
              location_id: location_id,
              type: "sale",
              quantity_delta: -qty.to_d,
              reference_type: "Sale",
              reference_id: sale.id,
              created_by: current_user.id,
              note: "Sale"
            )

            connection = ActiveRecord::Base.connection
            connection.execute <<~SQL
              INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
              VALUES (gen_random_uuid(), #{connection.quote(current_organization.id)}, #{connection.quote(variant_id)}, #{connection.quote(location_id)}, #{connection.quote(-qty.to_d)}, now())
              ON CONFLICT (org_id, variant_id, location_id)
              DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                           updated_at = now();
            SQL
          end

          payments.each do |payment|
            p = payment.to_h
            Payment.create!(
              sale_id: sale.id,
              method: p.fetch("method") { p.fetch(:method) },
              amount: p.fetch("amount") { p.fetch(:amount) },
              reference: p["reference"] || p[:reference],
              paid_at: p["paid_at"] || p[:paid_at] || Time.current
            )
          end
        end

        render json: { sale: sale_payload(sale, include_items: true, include_payments: true) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      private

      def load_sale
        @sale = Sale.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def sale_params
        params.require(:sale).permit(
          :location_id,
          :sold_at,
          :idempotency_key,
          items: %i[variant_id quantity unit_price discount tax],
          payments: %i[method amount reference paid_at]
        )
      end

      def compute_sale_totals(items)
        subtotal = 0.to_d
        discount = 0.to_d
        tax = 0.to_d
        items.each do |item|
          h = item.to_h
          qty = h.fetch("quantity") { h.fetch(:quantity) }.to_d
          unit_price = h.fetch("unit_price") { h.fetch(:unit_price) }.to_d
          line_subtotal = qty * unit_price
          subtotal += line_subtotal
          discount += (h["discount"] || h[:discount] || 0).to_d
          tax += (h["tax"] || h[:tax] || 0).to_d
        end
        total_amount = subtotal + tax - discount
        { subtotal:, tax:, discount:, total_amount: }
      end

      def sale_payload(sale, include_items: false, include_payments: false)
        payload = sale.slice(:id, :org_id, :location_id, :cashier_id, :status, :subtotal, :tax, :discount, :total_amount, :sold_at, :created_at, :idempotency_key)
        payload[:items] = sale.sale_items.order(:id).map { |i| i.slice(:id, :sale_id, :variant_id, :quantity, :unit_price, :discount, :tax) } if include_items
        payload[:payments] = sale.payments.order(:id).map { |p| p.slice(:id, :sale_id, :method, :amount, :reference, :paid_at) } if include_payments
        payload
      end
    end
  end
end

