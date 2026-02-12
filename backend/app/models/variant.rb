class Variant < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :product

  validates :org_id, presence: true
  validates :product_id, presence: true
  validates :sku, presence: true
end

