module Inventory
  # Recomputes the snapshot cache from the ledger. Snapshots are derived data, so this
  # is always safe to run; it exists for reconciliation and for repairing drift.
  class RebuildSnapshots
    def self.call(org_id:, variant_id: nil, location_id: nil)
      new(org_id:, variant_id:, location_id:).call
    end

    def initialize(org_id:, variant_id: nil, location_id: nil)
      @org_id = org_id
      @variant_id = variant_id.presence
      @location_id = location_id.presence
    end

    # => number of snapshot rows written
    def call
      totals = OnHand.by_variant_and_location(
        org_id: @org_id,
        variant_ids: @variant_id,
        location_id: @location_id
      )

      ActiveRecord::Base.transaction do
        scoped_snapshots.delete_all

        totals.each do |(variant_id, location_id), quantity|
          InventorySnapshot.create!(
            org_id: @org_id,
            variant_id: variant_id,
            location_id: location_id,
            quantity: quantity,
            updated_at: Time.current
          )
        end
      end

      totals.size
    end

    private

    def scoped_snapshots
      scope = InventorySnapshot.where(org_id: @org_id)
      scope = scope.where(variant_id: @variant_id) if @variant_id.present?
      scope = scope.where(location_id: @location_id) if @location_id.present?
      scope
    end
  end
end
