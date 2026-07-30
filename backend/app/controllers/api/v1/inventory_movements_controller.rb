module Api
  module V1
    class InventoryMovementsController < ApplicationController
      DEFAULT_LIMIT = 50
      MAX_LIMIT = 200

      before_action :authenticate!
      before_action :load_movement, only: %i[show]

      def index
        require_permission!("inventory.view_movements")
        return if performed?

        movements = InventoryMovement.where(org_id: current_organization.id)
        movements = movements.where(variant_id: params[:variant_id]) if params[:variant_id].present?
        movements = movements.where(location_id: params[:location_id]) if params[:location_id].present?
        movements = movements.where(created_by: params[:created_by]) if params[:created_by].present?
        if params[:reference_type].present? && params[:reference_id].present?
          movements = movements.where(reference_type: params[:reference_type], reference_id: params[:reference_id])
        end

        if params[:type].present?
          unless Inventory::RecordMovement::TYPES.include?(params[:type])
            return render_error(code: "invalid_type", message: "Invalid movement type", status: :unprocessable_entity)
          end

          movements = movements.where(type: params[:type])
        end

        begin
          from = parse_time(params[:from])
          to = parse_time(params[:to])
        rescue ArgumentError => e
          return render_error(code: "invalid_date", message: e.message, status: :unprocessable_entity)
        end
        movements = movements.where(created_at: from..) if from
        movements = movements.where(created_at: ..to) if to

        begin
          movements = apply_cursor(movements, params[:cursor])
        rescue ArgumentError => e
          return render_error(code: "invalid_cursor", message: e.message, status: :unprocessable_entity)
        end

        limit = requested_limit
        # One extra row answers "is there another page?" without a second count query.
        page = movements.order(created_at: :desc, id: :desc).limit(limit + 1).to_a
        has_more = page.size > limit
        page = page.first(limit)

        render json: {
          inventory_movements: page.map { |m| movement_payload(m) },
          next_cursor: has_more ? encode_cursor(page.last) : nil
        }
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

      # A junk limit falls back to the default rather than to `to_i`'s 0, which would clamp to a
      # single row and look like the ledger had emptied out.
      def requested_limit
        requested = Integer(params[:limit], exception: false)
        return DEFAULT_LIMIT if requested.nil?

        requested.clamp(1, MAX_LIMIT)
      end

      def parse_time(value)
        return nil if value.blank?

        Time.zone.parse(value.to_s) || raise(ArgumentError, "Invalid date: #{value}")
      rescue ArgumentError
        raise ArgumentError, "Invalid date: #{value}"
      end

      # Keyset rather than offset: the ledger only ever grows at the head, so an offset page
      # would skip rows as soon as a movement lands mid-scroll.
      def apply_cursor(scope, cursor)
        return scope if cursor.blank?

        decoded = Base64.urlsafe_decode64(cursor.to_s)
        created_at, id = decoded.split("|", 2)
        # The id goes into a row comparison against a uuid column, so a non-uuid would reach
        # Postgres as a cast error (a 500) rather than the 422 this deserves.
        raise ArgumentError, "Invalid cursor" unless Inventory::RecordMovement::UUID_FORMAT.match?(id.to_s)

        timestamp = Time.zone.parse(created_at) || raise(ArgumentError, "Invalid cursor")
        scope.where(
          "(inventory_movements.created_at, inventory_movements.id) < (?, ?)",
          timestamp,
          id
        )
      rescue ArgumentError
        raise ArgumentError, "Invalid cursor"
      end

      def encode_cursor(movement)
        Base64.urlsafe_encode64("#{movement.created_at.iso8601(6)}|#{movement.id}")
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
