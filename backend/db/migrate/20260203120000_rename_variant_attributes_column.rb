class RenameVariantAttributesColumn < ActiveRecord::Migration[8.0]
  def change
    rename_column :variants, :attributes, :attrs
  end
end

