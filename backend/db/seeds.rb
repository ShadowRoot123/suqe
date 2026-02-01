permission_keys = %w[
  org.manage
  users.invite
  users.manage_roles
  catalog.read
  catalog.write
  catalog.import_export
  locations.read
  locations.write
  inventory.read
  inventory.adjust
  inventory.view_movements
  inventory.low_stock_config
  purchasing.read
  purchasing.write
  purchasing.receive
  pos.sell
  pos.apply_discount
  pos.void_sale
  pos.refund
  transfers.create
  transfers.approve
  transfers.dispatch
  transfers.receive
  reports.view
  reports.export
  settings.tax_config
  settings.receipt_config
]

connection = ActiveRecord::Base.connection

permission_keys.each do |key|
  connection.execute <<~SQL
    INSERT INTO permissions (id, key)
    VALUES (gen_random_uuid(), #{connection.quote(key)})
    ON CONFLICT (key) DO NOTHING;
  SQL
end
