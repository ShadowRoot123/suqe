class PurchaseReceiptItem < ApplicationRecord
  belongs_to :purchase_receipt, foreign_key: :receipt_id, inverse_of: :purchase_receipt_items
  belongs_to :variant, inverse_of: false

  validates :receipt_id, presence: true
  validates :variant_id, presence: true
  validates :quantity_received, presence: true
  validates :unit_cost, presence: true
end

