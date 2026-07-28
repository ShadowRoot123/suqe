module Inventory
  # On-hand is always derived from the immutable movement ledger; inventory_snapshots
  # is only a cache of these sums.
  class OnHand
    def self.for(org_id:, variant_id:, location_id: nil)
      scope = InventoryMovement.where(org_id: org_id, variant_id: variant_id)
      scope = scope.where(location_id: location_id) if location_id.present?
      scope.sum(:quantity_delta)
    end

    # => { location_id => quantity }
    def self.by_location(org_id:, variant_id:)
      InventoryMovement
        .where(org_id: org_id, variant_id: variant_id)
        .group(:location_id)
        .sum(:quantity_delta)
    end

    # => { [variant_id, location_id] => quantity }
    def self.by_variant_and_location(org_id:, variant_ids: nil, location_id: nil)
      scope = InventoryMovement.where(org_id: org_id)
      scope = scope.where(variant_id: variant_ids) if variant_ids.present?
      scope = scope.where(location_id: location_id) if location_id.present?
      scope.group(:variant_id, :location_id).sum(:quantity_delta)
    end
  end
end
