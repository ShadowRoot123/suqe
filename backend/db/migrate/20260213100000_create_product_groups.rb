class CreateProductGroups < ActiveRecord::Migration[8.0]
  def change
    create_table :product_groups, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.text :name, null: false
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id name], unique: true
    end
    add_foreign_key :product_groups, :organizations, column: :org_id, on_delete: :restrict

    create_table :product_group_memberships, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :org_id, null: false
      t.uuid :product_group_id, null: false
      t.uuid :product_id, null: false
      t.datetime :created_at, null: false, default: -> { "now()" }
      t.datetime :updated_at, null: false, default: -> { "now()" }
      t.index %i[org_id product_group_id product_id], unique: true, name: "idx_pg_memberships_unique"
      t.index %i[org_id product_group_id], name: "idx_pg_memberships_group"
      t.index %i[org_id product_id], name: "idx_pg_memberships_product"
    end
    add_foreign_key :product_group_memberships, :organizations, column: :org_id, on_delete: :restrict
    add_foreign_key :product_group_memberships, :product_groups, column: :product_group_id, on_delete: :cascade
    add_foreign_key :product_group_memberships, :products, column: :product_id, on_delete: :cascade
  end
end

