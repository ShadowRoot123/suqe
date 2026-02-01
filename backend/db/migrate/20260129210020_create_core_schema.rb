class CreateCoreSchema < ActiveRecord::Migration[8.0]
  def change
    create_table :organizations, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.text :name, null: false
      t.text :currency, null: false, default: "USD"
      t.text :tax_mode, null: false, default: "exclusive"
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
    end

    create_table :users, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.text :email, null: false
      t.text :password_digest
      t.column :status, :user_status, null: false, default: "invited"
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id email], unique: true
    end
    add_foreign_key :users, :organizations, column: :org_id, on_delete: :restrict

    create_table :roles, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :roles, :organizations, column: :org_id, on_delete: :restrict

    create_table :permissions, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.text :key, null: false
      t.index :key, unique: true
    end

    create_table :role_permissions, id: false do |t|
      t.uuid :role_id, null: false
      t.uuid :permission_id, null: false
    end
    execute "ALTER TABLE role_permissions ADD PRIMARY KEY (role_id, permission_id)"
    add_foreign_key :role_permissions, :roles, column: :role_id, on_delete: :cascade
    add_foreign_key :role_permissions, :permissions, column: :permission_id, on_delete: :cascade

    create_table :user_roles, id: false do |t|
      t.uuid :user_id, null: false
      t.uuid :role_id, null: false
    end
    execute "ALTER TABLE user_roles ADD PRIMARY KEY (user_id, role_id)"
    add_foreign_key :user_roles, :users, column: :user_id, on_delete: :cascade
    add_foreign_key :user_roles, :roles, column: :role_id, on_delete: :cascade

    create_table :locations, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.column :type, :location_type, null: false
      t.text :address
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :locations, :organizations, column: :org_id, on_delete: :restrict

    create_table :categories, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.uuid :parent_id
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :categories, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :categories, :categories, column: :parent_id, on_delete: :restrict

    create_table :products, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :category_id
      t.text :name, null: false
      t.column :status, :product_status, null: false, default: "active"
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :products, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :products, :categories, column: :category_id, on_delete: :restrict

    create_table :variants, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :product_id, null: false
      t.text :sku, null: false
      t.text :barcode
      t.jsonb :attributes, null: false, default: {}
      t.decimal :price, precision: 12, scale: 2, null: false, default: 0
      t.decimal :cost_price, precision: 12, scale: 2, null: false, default: 0
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id sku], unique: true
      t.index %i[org_id barcode], unique: true
    end
    add_foreign_key :variants, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :variants, :products, column: :product_id, on_delete: :restrict

    create_table :inventory_movements, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :variant_id, null: false
      t.uuid :location_id, null: false
      t.column :type, :inventory_movement_type, null: false
      t.decimal :quantity_delta, precision: 14, scale: 3, null: false
      t.text :reference_type
      t.uuid :reference_id
      t.text :note
      t.uuid :created_by
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.text :idempotency_key
      t.index %i[org_id idempotency_key], unique: true
      t.index %i[org_id variant_id location_id created_at], order: { created_at: :desc }, name: "idx_inventory_movements_variant_location_time"
      t.index %i[org_id reference_type reference_id], name: "idx_inventory_movements_reference"
    end
    add_foreign_key :inventory_movements, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :inventory_movements, :variants, column: :variant_id, on_delete: :restrict
    add_foreign_key :inventory_movements, :locations, column: :location_id, on_delete: :restrict
    add_foreign_key :inventory_movements, :users, column: :created_by, on_delete: :nullify

    create_table :inventory_snapshots, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :variant_id, null: false
      t.uuid :location_id, null: false
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 0
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id variant_id location_id], unique: true
    end
    add_foreign_key :inventory_snapshots, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :inventory_snapshots, :variants, column: :variant_id, on_delete: :restrict
    add_foreign_key :inventory_snapshots, :locations, column: :location_id, on_delete: :restrict

    create_table :suppliers, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.text :phone
      t.text :email
      t.text :address
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :suppliers, :organizations, column: :org_id, on_delete: :restrict

    create_table :purchase_orders, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :supplier_id, null: false
      t.uuid :location_id, null: false
      t.column :status, :purchase_order_status, null: false, default: "draft"
      t.datetime :expected_at
      t.decimal :total_cost, precision: 12, scale: 2, null: false, default: 0
      t.uuid :created_by
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id status created_at], order: { created_at: :desc }, name: "idx_purchase_orders_by_org_status"
    end
    add_foreign_key :purchase_orders, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :purchase_orders, :suppliers, column: :supplier_id, on_delete: :restrict
    add_foreign_key :purchase_orders, :locations, column: :location_id, on_delete: :restrict
    add_foreign_key :purchase_orders, :users, column: :created_by, on_delete: :nullify

    create_table :purchase_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :purchase_order_id, null: false
      t.uuid :variant_id, null: false
      t.decimal :quantity_ordered, precision: 14, scale: 3, null: false
      t.decimal :unit_cost, precision: 12, scale: 2, null: false
      t.datetime :created_at, null: false, default: -> { "now()" }
    end
    add_foreign_key :purchase_items, :purchase_orders, column: :purchase_order_id, on_delete: :cascade
    add_foreign_key :purchase_items, :variants, column: :variant_id, on_delete: :restrict

    create_table :purchase_receipts, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :purchase_order_id, null: false
      t.datetime :received_at, null: false, default: -> { "now()" }
      t.uuid :received_by
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.text :idempotency_key
      t.index %i[org_id idempotency_key], unique: true
    end
    add_foreign_key :purchase_receipts, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :purchase_receipts, :purchase_orders, column: :purchase_order_id, on_delete: :restrict
    add_foreign_key :purchase_receipts, :users, column: :received_by, on_delete: :nullify

    create_table :purchase_receipt_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :receipt_id, null: false
      t.uuid :variant_id, null: false
      t.decimal :quantity_received, precision: 14, scale: 3, null: false
      t.decimal :unit_cost, precision: 12, scale: 2, null: false
    end
    add_foreign_key :purchase_receipt_items, :purchase_receipts, column: :receipt_id, on_delete: :cascade
    add_foreign_key :purchase_receipt_items, :variants, column: :variant_id, on_delete: :restrict

    create_table :sales, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :location_id, null: false
      t.uuid :cashier_id
      t.column :status, :sale_status, null: false, default: "completed"
      t.decimal :subtotal, precision: 12, scale: 2, null: false, default: 0
      t.decimal :tax, precision: 12, scale: 2, null: false, default: 0
      t.decimal :discount, precision: 12, scale: 2, null: false, default: 0
      t.decimal :total_amount, precision: 12, scale: 2, null: false, default: 0
      t.datetime :sold_at, null: false, default: -> { "now()" }
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.text :idempotency_key
      t.index %i[org_id idempotency_key], unique: true
      t.index %i[org_id location_id sold_at], order: { sold_at: :desc }, name: "idx_sales_by_org_location_time"
      t.index %i[org_id cashier_id sold_at], order: { sold_at: :desc }, name: "idx_sales_by_org_cashier_time"
    end
    add_foreign_key :sales, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :sales, :locations, column: :location_id, on_delete: :restrict
    add_foreign_key :sales, :users, column: :cashier_id, on_delete: :nullify

    create_table :sale_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :sale_id, null: false
      t.uuid :variant_id, null: false
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :unit_price, precision: 12, scale: 2, null: false
      t.decimal :discount, precision: 12, scale: 2, null: false, default: 0
      t.decimal :tax, precision: 12, scale: 2, null: false, default: 0
    end
    add_foreign_key :sale_items, :sales, column: :sale_id, on_delete: :cascade
    add_foreign_key :sale_items, :variants, column: :variant_id, on_delete: :restrict

    create_table :payments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :sale_id, null: false
      t.text :method, null: false
      t.decimal :amount, precision: 12, scale: 2, null: false
      t.text :reference
      t.datetime :paid_at, null: false, default: -> { "now()" }
    end
    add_foreign_key :payments, :sales, column: :sale_id, on_delete: :cascade

    create_table :returns, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :sale_id, null: false
      t.uuid :location_id, null: false
      t.uuid :processed_by
      t.text :reason
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.text :idempotency_key
      t.index %i[org_id idempotency_key], unique: true
    end
    add_foreign_key :returns, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :returns, :sales, column: :sale_id, on_delete: :restrict
    add_foreign_key :returns, :locations, column: :location_id, on_delete: :restrict
    add_foreign_key :returns, :users, column: :processed_by, on_delete: :nullify

    create_table :return_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :return_id, null: false
      t.uuid :sale_item_id, null: false
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.boolean :restockable, null: false, default: true
    end
    add_foreign_key :return_items, :returns, column: :return_id, on_delete: :cascade
    add_foreign_key :return_items, :sale_items, column: :sale_item_id, on_delete: :restrict

    create_table :refunds, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :return_id, null: false
      t.text :method, null: false
      t.decimal :amount, precision: 12, scale: 2, null: false
      t.datetime :refunded_at, null: false, default: -> { "now()" }
    end
    add_foreign_key :refunds, :returns, column: :return_id, on_delete: :cascade

    create_table :stock_transfers, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :from_location_id, null: false
      t.uuid :to_location_id, null: false
      t.column :status, :stock_transfer_status, null: false, default: "draft"
      t.uuid :created_by
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.text :idempotency_key
      t.index %i[org_id idempotency_key], unique: true
      t.index %i[org_id status created_at], order: { created_at: :desc }, name: "idx_stock_transfers_by_org_status"
    end
    add_check_constraint :stock_transfers, "from_location_id <> to_location_id", name: "stock_transfers_distinct_locations"
    add_foreign_key :stock_transfers, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :stock_transfers, :locations, column: :from_location_id, on_delete: :restrict
    add_foreign_key :stock_transfers, :locations, column: :to_location_id, on_delete: :restrict
    add_foreign_key :stock_transfers, :users, column: :created_by, on_delete: :nullify

    create_table :stock_transfer_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :transfer_id, null: false
      t.uuid :variant_id, null: false
      t.decimal :quantity, precision: 14, scale: 3, null: false
    end
    add_foreign_key :stock_transfer_items, :stock_transfers, column: :transfer_id, on_delete: :cascade
    add_foreign_key :stock_transfer_items, :variants, column: :variant_id, on_delete: :restrict

    create_table :sync_outbox, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :client_id, null: false
      t.text :entity, null: false
      t.text :operation, null: false
      t.jsonb :payload, null: false
      t.text :idempotency_key, null: false
      t.column :status, :outbox_status, null: false, default: "pending"
      t.integer :retry_count, null: false, default: 0
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id idempotency_key], unique: true
      t.index %i[org_id status created_at], order: { created_at: :asc }, name: "idx_sync_outbox_pending"
    end
    add_foreign_key :sync_outbox, :organizations, column: :org_id, on_delete: :restrict

    create_table :audit_logs, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :actor_user_id
      t.text :action, null: false
      t.text :entity
      t.uuid :entity_id
      t.jsonb :metadata, null: false, default: {}
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.index %i[org_id created_at], order: { created_at: :desc }, name: "idx_audit_logs_by_org_time"
    end
    add_foreign_key :audit_logs, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :audit_logs, :users, column: :actor_user_id, on_delete: :nullify
  end
end
