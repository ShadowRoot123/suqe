module Api
  module V1
    class InventorySnapshotsController < ApplicationController
      before_action :authenticate!

      def index
        require_permission!("inventory.read")
        return if performed?

        snapshots = InventorySnapshot.where(org_id: current_organization.id)
        snapshots = snapshots.where(variant_id: params[:variant_id]) if params[:variant_id].present?
        snapshots = snapshots.where(location_id: params[:location_id]) if params[:location_id].present?
        snapshots = snapshots.order(updated_at: :desc)

        render json: {
          inventory_snapshots: snapshots.map { |snapshot| snapshot_payload(snapshot) }
        }
      end

      private

      def snapshot_payload(snapshot)
        snapshot.slice(:org_id, :variant_id, :location_id, :quantity, :updated_at)
      end
    end
  end
end

