module Api
  module V1
    class InventoryMovementsController < ApplicationController
      before_action :authenticate!
      before_action :load_movement, only: %i[show]

      def index
        require_permission!("inventory.view_movements")
        return if performed?

        movements = InventoryMovement.where(org_id: current_organization.id)
        movements = movements.where(variant_id: params[:variant_id]) if params[:variant_id].present?
        movements = movements.where(location_id: params[:location_id]) if params[:location_id].present?
        movements = movements.where(reference_type: params[:reference_type], reference_id: params[:reference_id]) if params[:reference_type].present? && params[:reference_id].present?
        movements = movements.order(created_at: :desc)

        render json: { inventory_movements: movements.limit(500).map { |m| movement_payload(m) } }
      end

      def show
        require_permission!("inventory.view_movements")
        return if performed?

        render json: { inventory_movement: movement_payload(@movement) }
      end

      def create
        require_permission!("inventory.adjust")
        return if performed?

        attributes = movement_params
        variant_id = attributes.fetch(:variant_id)
        location_id = attributes.fetch(:location_id)

        return render_error(code: "invalid_variant", message: "Invalid variant", status: :unprocessable_entity) unless Variant.where(org_id: current_organization.id, id: variant_id).exists?
        return render_error(code: "invalid_location", message: "Invalid location", status: :unprocessable_entity) unless Location.where(org_id: current_organization.id, id: location_id).exists?

        movement = Inventory::RecordMovement.call(
          org_id: current_organization.id,
          variant_id: variant_id,
          location_id: location_id,
          quantity_delta: attributes.fetch(:quantity_delta),
          note: attributes[:note],
          created_by: current_user.id,
          idempotency_key: attributes[:idempotency_key]
        )

        render json: { inventory_movement: movement_payload(movement) }, status: :created
      rescue ArgumentError => e
        render_error(code: "validation_error", message: e.message, status: :unprocessable_entity)
      end

      private

      def load_movement
        @movement = InventoryMovement.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def movement_params
        movement = params.require(:inventory_movement).permit(:variant_id, :location_id, :quantity_delta, :note, :idempotency_key)
        movement.require(:variant_id)
        movement.require(:location_id)
        movement.require(:quantity_delta)
        movement
      end

      def movement_payload(movement)
        movement.slice(:id, :org_id, :variant_id, :location_id, :type, :quantity_delta, :reference_type, :reference_id, :note, :created_by, :created_at, :idempotency_key)
      end
    end
  end
end

