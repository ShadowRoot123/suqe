class SaleItem < ApplicationRecord
  belongs_to :sale, inverse_of: :sale_items
  belongs_to :variant, inverse_of: false

  validates :sale_id, presence: true
  validates :variant_id, presence: true
  validates :quantity, presence: true
  validates :unit_price, presence: true
end

