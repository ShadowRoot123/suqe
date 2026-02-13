class PurchaseItem < ApplicationRecord
  belongs_to :purchase_order, inverse_of: :purchase_items
  belongs_to :variant, inverse_of: false

  validates :purchase_order_id, presence: true
  validates :variant_id, presence: true
  validates :quantity_ordered, presence: true
  validates :unit_cost, presence: true
end

