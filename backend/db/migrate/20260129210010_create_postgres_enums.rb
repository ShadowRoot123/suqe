class CreatePostgresEnums < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_type') THEN
          CREATE TYPE location_type AS ENUM ('shop', 'warehouse');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
          CREATE TYPE user_status AS ENUM ('active', 'invited', 'disabled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
          CREATE TYPE product_status AS ENUM ('active', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_status') THEN
          CREATE TYPE purchase_order_status AS ENUM ('draft', 'approved', 'partially_received', 'received', 'closed', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_status') THEN
          CREATE TYPE sale_status AS ENUM ('completed', 'voided');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_transfer_status') THEN
          CREATE TYPE stock_transfer_status AS ENUM ('draft', 'approved', 'dispatched', 'received', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movement_type') THEN
          CREATE TYPE inventory_movement_type AS ENUM ('purchase', 'sale', 'return', 'adjustment', 'transfer_out', 'transfer_in');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_status') THEN
          CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'applied', 'failed');
        END IF;
      END $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
