class AddVariantOptionsToProductGroups < ActiveRecord::Migration[8.0]
  def change
    add_column :product_groups, :variant_options, :jsonb, null: false, default: {}
  end
end

