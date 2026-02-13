class StockTransferItem < ApplicationRecord
  belongs_to :stock_transfer, foreign_key: :transfer_id, inverse_of: :stock_transfer_items
  belongs_to :variant, inverse_of: false

  validates :transfer_id, presence: true
  validates :variant_id, presence: true
  validates :quantity, presence: true
end

