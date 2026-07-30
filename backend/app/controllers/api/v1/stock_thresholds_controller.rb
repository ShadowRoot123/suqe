module Api
  module V1
    # Read-only: reorder points are written through the sync command pipeline like every other
    # mobile write. This is the bootstrap path a fresh install uses to fill its local cache,
    # and the online-first low-stock view.
    class StockThresholdsController < ApplicationController
      before_action :authenticate!

      def index
        require_permission!("inventory.read")
        return if performed?

        thresholds = StockThreshold.where(org_id: current_organization.id)
        thresholds = thresholds.where(variant_id: params[:variant_id]) if params[:variant_id].present?
        # An explicit location still wants the variant-wide defaults, which is what applies there
        # when no row names the location.
        thresholds = thresholds.where(location_id: [params[:location_id], nil]) if params[:location_id].present?

        render json: {
          stock_thresholds: thresholds.order(:created_at).map { |threshold| threshold_payload(threshold) }
        }
      end

      def low_stock
        require_permission!("inventory.read")
        return if performed?

        rows = Inventory::LowStock.rows(
          org_id: current_organization.id,
          location_id: params[:location_id].presence
        )

        render json: { low_stock: rows.map { |row| low_stock_payload(row) } }
      end

      private

      def threshold_payload(threshold)
        {
          id: threshold.id,
          org_id: threshold.org_id,
          variant_id: threshold.variant_id,
          location_id: threshold.location_id,
          reorder_point: threshold.reorder_point.to_s,
          reorder_quantity: threshold.reorder_quantity&.to_s,
          updated_at: threshold.updated_at
        }
      end

      def low_stock_payload(row)
        {
          variant_id: row.variant_id,
          location_id: row.location_id,
          on_hand: row.on_hand.to_s,
          reorder_point: row.reorder_point.to_s,
          reorder_quantity: row.reorder_quantity&.to_s,
          shortfall: row.shortfall.to_s
        }
      end
    end
  end
end
