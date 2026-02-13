class Sale < ApplicationRecord
  self.record_timestamps = false

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :location, inverse_of: false
  belongs_to :cashier, class_name: "User", foreign_key: :cashier_id, optional: true, inverse_of: false

  has_many :sale_items, dependent: :destroy, inverse_of: :sale
  has_many :payments, dependent: :destroy, inverse_of: :sale

  validates :org_id, presence: true
  validates :location_id, presence: true
end

