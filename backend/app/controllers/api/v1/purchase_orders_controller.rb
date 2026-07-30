module Api
  module V1
    class PurchaseOrdersController < ApplicationController
      # Writes here and writes arriving on the sync pipeline both go through the Purchasing::
      # services, so the lifecycle table and the line rules cannot drift between the two
      # surfaces — the same reason InventoryMovementsController#create goes through
      # Inventory::RecordMovement.
      ARGUMENT_ERROR_CODES = {
        "Invalid supplier" => "invalid_supplier",
        "Invalid location" => "invalid_location",
        "Invalid variant" => "invalid_variant"
      }.freeze

      before_action :authenticate!
      before_action :load_purchase_order, only: %i[show update destroy]

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

        orders = PurchaseOrder.where(org_id: current_organization.id).order(created_at: :desc)

        if params[:status].present?
          status = Purchasing::OrderLifecycle.normalize(params[:status])
          # An unknown status is a caller mistake, not an empty result set.
          unless Purchasing::OrderLifecycle.status?(status)
            return render_error(code: "invalid_status", message: "Invalid status", status: :unprocessable_entity)
          end

          orders = orders.where(status: status)
        end
        orders = orders.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?

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

        attrs = purchase_order_params
        order = Purchasing::CreateOrder.call(
          org_id: current_organization.id,
          supplier_id: attrs[:supplier_id],
          location_id: attrs[:location_id],
          expected_at: attrs[:expected_at],
          items: attrs[:items],
          created_by: current_user.id
        )

        # An order is always born a draft; a caller naming a later status is asking for that
        # transition, and it is guarded like any other.
        if attrs[:status].present? && Purchasing::OrderLifecycle.normalize(attrs[:status]) != order.status
          Purchasing::TransitionOrder.call(order: order, to: attrs[:status])
        end

        render json: { purchase_order: purchase_order_payload(order, include_items: true) }, status: :created
      end

      def update
        require_permission!("purchasing.write")
        return if performed?

        attrs = purchase_order_params

        # Edits land before the transition, so "these are the final lines, now approve it" still
        # edits while the order is a draft.
        Purchasing::UpdateOrder.call(order: @purchase_order, attrs: attrs) if Purchasing::UpdateOrder.edits?(attrs)
        Purchasing::TransitionOrder.call(order: @purchase_order, to: attrs[:status]) if attrs[:status].present?

        render json: { purchase_order: purchase_order_payload(@purchase_order, include_items: true) }
      end

      def destroy
        require_permission!("purchasing.write")
        return if performed?

        # Only a draft can be thrown away. Once the order is approved the supplier has seen it,
        # so the record has to survive — cancel it instead.
        unless Purchasing::OrderLifecycle.editable?(@purchase_order.status)
          return render_error(
            code: "invalid_transition",
            message: "Cannot delete a purchase order that is #{@purchase_order.status}",
            status: :conflict
          )
        end

        @purchase_order.destroy!
        head :no_content
      end

      private

      def load_purchase_order
        @purchase_order = PurchaseOrder.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def purchase_order_params
        params
          .require(:purchase_order)
          .permit(:supplier_id, :location_id, :status, :expected_at, items: %i[id variant_id quantity_ordered unit_cost])
          .to_h
          .symbolize_keys
      end

      def purchase_order_payload(order, include_items: false)
        payload = order.slice(:id, :org_id, :supplier_id, :location_id, :status, :expected_at, :total_cost, :created_by, :created_at, :updated_at)
        payload[:items] = Purchasing::OrderLines.payload(order) if include_items
        payload
      end
    end
  end
end
