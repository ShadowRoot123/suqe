class ReturnItem < ApplicationRecord
  belongs_to :return, inverse_of: :return_items
  belongs_to :sale_item, inverse_of: false

  validates :return_id, presence: true
  validates :sale_item_id, presence: true
  validates :quantity, presence: true
end

