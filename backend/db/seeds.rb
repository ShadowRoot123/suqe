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

if Rails.env.production?
  puts "Skipping demo seed data in production"
  return
end

demo_password = ENV.fetch("DEMO_SEED_PASSWORD", "Password123!")
shared_demo_email = ENV.fetch("DEMO_SEED_EMAIL", "demo@myshop.test")

demo_organizations = [
  { name: "Acme Mart", currency: "USD", tax_mode: "exclusive" },
  { name: "Blue Sky Grocers", currency: "USD", tax_mode: "exclusive" },
  { name: "GreenLeaf Pharmacy", currency: "USD", tax_mode: "exclusive" },
  { name: "Sunrise Electronics", currency: "USD", tax_mode: "exclusive" },
  { name: "Urban Outfit Supplies", currency: "USD", tax_mode: "exclusive" }
]

all_permissions = Permission.where(key: permission_keys).to_a

ActiveRecord::Base.transaction do
  demo_organizations.each_with_index do |seed_org, index|
    org =
      Organization.find_or_create_by!(name: seed_org[:name]) do |o|
        o.currency = seed_org[:currency]
        o.tax_mode = seed_org[:tax_mode]
      end

    owner_role = Role.find_or_create_by!(org_id: org.id, name: "Owner")
    owner_role.permissions = all_permissions if owner_role.permissions.size != all_permissions.size

    Location.find_or_create_by!(org_id: org.id, name: "Main Shop") do |loc|
      loc.type = "shop"
      loc.address = "Demo Address"
    end

    shared_user = User.find_or_initialize_by(org_id: org.id, email: shared_demo_email)
    shared_user.name = "Demo Admin"
    shared_user.status = "active"
    shared_user.password = demo_password
    shared_user.password_confirmation = demo_password
    shared_user.save!
    UserRole.find_or_create_by!(user_id: shared_user.id, role_id: owner_role.id)

    unique_email = "admin+org#{index + 1}@myshop.test"
    unique_user = User.find_or_initialize_by(org_id: org.id, email: unique_email)
    unique_user.name = "Org #{index + 1} Admin"
    unique_user.status = "active"
    unique_user.password = demo_password
    unique_user.password_confirmation = demo_password
    unique_user.save!
    UserRole.find_or_create_by!(user_id: unique_user.id, role_id: owner_role.id)

    alt_email = "adminorg#{index + 1}@myshop.test"
    alt_user = User.find_or_initialize_by(org_id: org.id, email: alt_email)
    alt_user.name = "Org #{index + 1} Admin"
    alt_user.status = "active"
    alt_user.password = demo_password
    alt_user.password_confirmation = demo_password
    alt_user.save!
    UserRole.find_or_create_by!(user_id: alt_user.id, role_id: owner_role.id)
  end
end

require_relative "../lib/xlsx_simple_reader"
require "zlib"

xlsx_path = Rails.root.join("..", ".trae", "items.xlsx").to_s
seed_items_enabled = ENV.fetch("DEMO_SEED_ITEMS", "1") != "0"

if seed_items_enabled && File.exist?(xlsx_path)
  sheet_rows = XlsxSimpleReader.read_rows(xlsx_path)
  header_row = sheet_rows.find { |r| r[:row] == 1 }
  header_by_col = (header_row && header_row[:cells]) || {}
  normalized_headers =
    header_by_col.transform_values do |h|
      h.to_s.strip.downcase
    end

  organizations_to_seed = demo_organizations.map { |o| Organization.find_by(name: o[:name]) }.compact

  ActiveRecord::Base.transaction do
    organizations_to_seed.each do |org|
      main_location = Location.find_by(org_id: org.id, name: "Main Shop")
      next if main_location.blank?

      sheet_rows.each do |row|
        next if row[:row] <= 1

        data = {}
        normalized_headers.each do |col, key|
          next if key.blank?
          data[key] = row[:cells][col]
        end

        type_name = data["type"].to_s.strip
        item_name = data["item"].to_s.strip
        size_value = data["size"].to_s.strip
        price_value = data["price"].to_s.strip

        category_name = data["category"].to_s.strip

        next if category_name.blank? && item_name.blank? && type_name.blank?

        product_name = item_name.presence || type_name.presence || category_name
        derived_category = type_name.presence || product_name.to_s.split(/\s+/).first.to_s
        category_name = category_name.presence || derived_category.presence || "Uncategorized"
        category_name = category_name.to_s.strip.titleize

        category = Category.find_or_create_by!(org_id: org.id, name: category_name)
        product = Product.find_or_create_by!(org_id: org.id, name: product_name) do |p|
          p.category_id = category.id
        end
        product.update!(category_id: category.id) if product.category_id != category.id

        sku_parts = ["DEMO", product_name.parameterize(separator: "_").upcase]
        sku_parts << size_value.parameterize(separator: "_").upcase if size_value.present?
        sku = sku_parts.join("_")

        variant = Variant.find_or_initialize_by(org_id: org.id, sku: sku)
        variant.product_id = product.id
        variant.attrs = {
          "size" => size_value.presence,
          "type" => type_name.presence,
          "source" => "items.xlsx"
        }.compact
        variant.price = price_value.present? ? BigDecimal(price_value) : 0
        variant.cost_price ||= 0
        variant.save!

        # Opening stock goes through the ledger, not straight into the snapshot cache —
        # the idempotency key keeps re-seeding from stacking more stock on top.
        Inventory::RecordMovement.call(
          org_id: org.id,
          variant_id: variant.id,
          location_id: main_location.id,
          quantity_delta: (Zlib.crc32(sku) % 50) + 1,
          note: "Opening stock (seed)",
          idempotency_key: "seed-opening-#{variant.id}"
        )
      end
    end
  end
end
