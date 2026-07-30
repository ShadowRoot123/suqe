module Api
  module V1
    class StockTransfersController < ApplicationController
      before_action :authenticate!
      before_action :load_transfer, only: %i[show update destroy]

      def index
        require_permission!("transfers.create")
        return if performed?

        transfers = StockTransfer.where(org_id: current_organization.id).order(created_at: :desc)
        transfers = transfers.where(status: params[:status]) if params[:status].present?
        render json: { stock_transfers: transfers.limit(200).map { |t| transfer_payload(t) } }
      end

      def show
        require_permission!("transfers.create")
        return if performed?

        render json: { stock_transfer: transfer_payload(@transfer, include_items: true) }
      end

      def create
        require_permission!("transfers.create")
        return if performed?

        attrs = transfer_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact

        from_location_id = attrs.fetch("from_location_id") { attrs.fetch(:from_location_id) }
        to_location_id = attrs.fetch("to_location_id") { attrs.fetch(:to_location_id) }

        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: from_location_id).exists?
        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: to_location_id).exists?

        transfer = nil
        StockTransfer.transaction do
          transfer = StockTransfer.create!(
            attrs.merge(
              org_id: current_organization.id,
              created_by: current_user.id
            )
          )
          replace_items!(transfer, items) if items.any?
        end

        render json: { stock_transfer: transfer_payload(transfer, include_items: true) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        target_status = transfer_params[:status]
        if target_status.present? && target_status != @transfer.status
          require_status_permission!(target_status)
          return if performed?
        else
          require_permission!("transfers.create")
          return if performed?
        end

        attrs = transfer_params.to_h
        items = Array(attrs.delete("items") || attrs.delete(:items)).compact
        previous_status = @transfer.status

        StockTransfer.transaction do
          @transfer.update!(attrs)
          replace_items!(@transfer, items) if items.any?
          apply_status_side_effects!(@transfer, previous_status)
        end

        render json: { stock_transfer: transfer_payload(@transfer, include_items: true) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("transfers.create")
        return if performed?

        @transfer.destroy!
        head :no_content
      end

      private

      def load_transfer
        @transfer = StockTransfer.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def transfer_params
        params.require(:stock_transfer).permit(:from_location_id, :to_location_id, :status, :idempotency_key, items: %i[variant_id quantity])
      end

      def require_status_permission!(status)
        case status.to_s
        when "approved"
          require_permission!("transfers.approve")
        when "dispatched"
          require_permission!("transfers.dispatch")
        when "received"
          require_permission!("transfers.receive")
        else
          require_permission!("transfers.create")
        end
      end

      def replace_items!(transfer, items)
        transfer.stock_transfer_items.destroy_all
        items.each do |item|
          h = item.to_h
          variant_id = h.fetch("variant_id") { h.fetch(:variant_id) }
          return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?

          StockTransferItem.create!(
            transfer_id: transfer.id,
            variant_id: variant_id,
            quantity: h.fetch("quantity") { h.fetch(:quantity) }
          )
        end
      end

      def apply_status_side_effects!(transfer, previous_status)
        return if transfer.status == previous_status

        if transfer.status == "dispatched" && previous_status != "dispatched"
          apply_transfer_out!(transfer)
        end

        if transfer.status == "received" && previous_status != "received"
          apply_transfer_in!(transfer)
        end
      end

      def apply_transfer_out!(transfer)
        transfer.stock_transfer_items.each do |item|
          qty = item.quantity.to_d
          InventoryMovement.create!(
            org_id: current_organization.id,
            variant_id: item.variant_id,
            location_id: transfer.from_location_id,
            type: "transfer_out",
            quantity_delta: -qty,
            reference_type: "StockTransfer",
            reference_id: transfer.id,
            created_by: current_user.id,
            note: "Transfer out"
          )

          connection = ActiveRecord::Base.connection
          connection.execute <<~SQL
            INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
            VALUES (gen_random_uuid(), #{connection.quote(current_organization.id)}, #{connection.quote(item.variant_id)}, #{connection.quote(transfer.from_location_id)}, #{connection.quote(-qty)}, now())
            ON CONFLICT (org_id, variant_id, location_id)
            DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                         updated_at = now();
          SQL
        end
      end

      def apply_transfer_in!(transfer)
        transfer.stock_transfer_items.each do |item|
          qty = item.quantity.to_d
          InventoryMovement.create!(
            org_id: current_organization.id,
            variant_id: item.variant_id,
            location_id: transfer.to_location_id,
            type: "transfer_in",
            quantity_delta: qty,
            reference_type: "StockTransfer",
            reference_id: transfer.id,
            created_by: current_user.id,
            note: "Transfer in"
          )

          connection = ActiveRecord::Base.connection
          connection.execute <<~SQL
            INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
            VALUES (gen_random_uuid(), #{connection.quote(current_organization.id)}, #{connection.quote(item.variant_id)}, #{connection.quote(transfer.to_location_id)}, #{connection.quote(qty)}, now())
            ON CONFLICT (org_id, variant_id, location_id)
            DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                         updated_at = now();
          SQL
        end
      end

      def transfer_payload(transfer, include_items: false)
        payload = transfer.slice(:id, :org_id, :from_location_id, :to_location_id, :status, :created_by, :created_at, :updated_at, :idempotency_key)
        payload[:items] = transfer.stock_transfer_items.order(:id).map { |i| i.slice(:id, :transfer_id, :variant_id, :quantity) } if include_items
        payload
      end
    end
  end
end

