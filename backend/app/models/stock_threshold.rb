class StockThreshold < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :variant, inverse_of: false
  belongs_to :location, optional: true, inverse_of: false

  # A row without a location is the variant-wide default; one naming a location overrides it there.
  scope :defaults, -> { where(location_id: nil) }

  validates :org_id, presence: true
  validates :variant_id, presence: true
  validates :reorder_point, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :reorder_quantity, numericality: { greater_than: 0 }, allow_nil: true
end
