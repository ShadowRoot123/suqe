module Inventory
  # Snapshots are a cache of the movement ledger. This applies a single delta to
  # the cached quantity; use RebuildSnapshots to recompute it from the ledger.
  class UpdateSnapshot
    def self.call(org_id:, variant_id:, location_id:, quantity_delta:)
      new(org_id:, variant_id:, location_id:, quantity_delta:).call
    end

    def initialize(org_id:, variant_id:, location_id:, quantity_delta:)
      @org_id = org_id
      @variant_id = variant_id
      @location_id = location_id
      @quantity_delta = quantity_delta
    end

    def call
      connection = ActiveRecord::Base.connection
      connection.execute <<~SQL
        INSERT INTO inventory_snapshots (id, org_id, variant_id, location_id, quantity, updated_at)
        VALUES (
          gen_random_uuid(),
          #{connection.quote(@org_id)},
          #{connection.quote(@variant_id)},
          #{connection.quote(@location_id)},
          #{connection.quote(@quantity_delta)},
          now()
        )
        ON CONFLICT (org_id, variant_id, location_id)
        DO UPDATE SET quantity = inventory_snapshots.quantity + EXCLUDED.quantity,
                      updated_at = now();
      SQL
    end
  end
end
