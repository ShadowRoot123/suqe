class InventorySnapshot < ApplicationRecord
  self.record_timestamps = false

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :variant, inverse_of: false
  belongs_to :location, inverse_of: false

  validates :org_id, presence: true
  validates :variant_id, presence: true
  validates :location_id, presence: true
end

