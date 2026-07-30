class CreateStockThresholds < ActiveRecord::Migration[8.0]
  def change
    create_table :stock_thresholds, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :variant_id, null: false
      # NULL means "any location" — the variant-wide default that a per-location row overrides.
      t.uuid :location_id
      t.decimal :reorder_point, precision: 14, scale: 3, null: false, default: 0
      t.decimal :reorder_quantity, precision: 14, scale: 3
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }

      t.index %i[org_id variant_id location_id],
              unique: true,
              where: "location_id IS NOT NULL",
              name: "idx_stock_thresholds_variant_location"
      # Postgres counts NULLs as distinct in a unique index, so the default row would not
      # collide with itself and every device could add another one. It needs its own index.
      t.index %i[org_id variant_id],
              unique: true,
              where: "location_id IS NULL",
              name: "idx_stock_thresholds_variant_default"
      t.index %i[org_id location_id], name: "idx_stock_thresholds_location"
    end

    add_check_constraint :stock_thresholds, "reorder_point >= 0", name: "chk_stock_thresholds_reorder_point"
    add_check_constraint :stock_thresholds,
                         "reorder_quantity IS NULL OR reorder_quantity > 0",
                         name: "chk_stock_thresholds_reorder_quantity"

    add_foreign_key :stock_thresholds, :organizations, column: :org_id, on_delete: :restrict
    # A threshold is configuration, not history, so it must never become the reason a variant or
    # a location cannot be deleted — every other foreign key into those tables is ON DELETE
    # RESTRICT, and inheriting that here would turn "set a reorder point" into "pinned forever".
    add_foreign_key :stock_thresholds, :variants, column: :variant_id, on_delete: :cascade
    add_foreign_key :stock_thresholds, :locations, column: :location_id, on_delete: :cascade

    # The movement log is read newest-first across the whole org; the existing index leads with
    # variant_id, so it cannot serve that ordering or the keyset cursor built on it.
    add_index :inventory_movements, %i[org_id created_at id],
              order: { created_at: :desc, id: :desc },
              name: "idx_inventory_movements_org_time"
  end
end
