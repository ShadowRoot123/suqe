module Api
  module V1
    class ReturnsController < ApplicationController
      before_action :authenticate!
      before_action :load_return, only: %i[show]

      def index
        require_permission!("reports.view")
        return if performed?

        returns = Return.where(org_id: current_organization.id).order(created_at: :desc)
        returns = returns.where(location_id: params[:location_id]) if params[:location_id].present?
        render json: { returns: returns.limit(200).map { |r| return_payload(r) } }
      end

      def show
        require_permission!("reports.view")
        return if performed?

        render json: { return: return_payload(@return, include_items: true, include_refunds: true) }
      end

      def create
        require_permission!("pos.refund")
        return if performed?

        attrs = return_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact
        refund = attrs.delete("refund") || attrs.delete(:refund)

        sale_id = attrs.fetch("sale_id") { attrs.fetch(:sale_id) }
        location_id = attrs.fetch("location_id") { attrs.fetch(:location_id) }
        sale = Sale.find_by(id: sale_id, org_id: current_organization.id)
        return render_error(code: "invalid_sale", message: "Invalid sale", status: :unprocessable_entity) if sale.blank?
        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: location_id).exists?
        return render_error(code: "items_required", message: "Items required", status: :unprocessable_entity) if items.empty?

        created_return = nil
        Return.transaction do
          created_return = Return.create!(
            attrs.merge(
              org_id: current_organization.id,
              processed_by: current_user.id,
              sale_id: sale.id
            )
          )

          items.each do |item|
            h = item.to_h
            sale_item_id = h.fetch("sale_item_id") { h.fetch(:sale_item_id) }
            sale_item = SaleItem.joins(:sale).find_by(id: sale_item_id, sales: { org_id: current_organization.id })
            return render_error(code: "invalid_sale_item", message: "Invalid sale item", status: :unprocessable_entity) if sale_item.blank?

            quantity = h.fetch("quantity") { h.fetch(:quantity) }
            restockable = h.key?("restockable") || h.key?(:restockable) ? (h["restockable"] || h[:restockable]) : true

            ReturnItem.create!(
              return_id: created_return.id,
              sale_item_id: sale_item.id,
              quantity: quantity,
              restockable: restockable
            )

            next unless restockable

            InventoryMovement.create!(
              org_id: current_organization.id,
              variant_id: sale_item.variant_id,
              location_id: location_id,
              type: "return",
              quantity_delta: quantity.to_d,
              reference_type: "Return",
              reference_id: created_return.id,
              created_by: current_user.id,
              note: "Return"
            )

            connection = ActiveRecord::Base.connection
            connection.execute <<~SQL
              INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
              VALUES (gen_random_uuid(), #{connection.quote(current_organization.id)}, #{connection.quote(sale_item.variant_id)}, #{connection.quote(location_id)}, #{connection.quote(quantity.to_d)}, now())
              ON CONFLICT (org_id, variant_id, location_id)
              DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                           updated_at = now();
            SQL
          end

          if refund.present?
            r = refund.to_h
            Refund.create!(
              return_id: created_return.id,
              method: r.fetch("method") { r.fetch(:method) },
              amount: r.fetch("amount") { r.fetch(:amount) },
              refunded_at: r["refunded_at"] || r[:refunded_at] || Time.current
            )
          end
        end

        render json: { return: return_payload(created_return, include_items: true, include_refunds: true) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      private

      def load_return
        @return = Return.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def return_params
        params.require(:return).permit(
          :sale_id,
          :location_id,
          :reason,
          :idempotency_key,
          items: %i[sale_item_id quantity restockable],
          refund: %i[method amount refunded_at]
        )
      end

      def return_payload(return_record, include_items: false, include_refunds: false)
        payload = return_record.slice(:id, :org_id, :sale_id, :location_id, :processed_by, :reason, :created_at, :idempotency_key)
        payload[:items] = return_record.return_items.order(:id).map { |i| i.slice(:id, :return_id, :sale_item_id, :quantity, :restockable) } if include_items
        payload[:refunds] = return_record.refunds.order(:id).map { |r| r.slice(:id, :return_id, :method, :amount, :refunded_at) } if include_refunds
        payload
      end
    end
  end
end

