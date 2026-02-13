class StockTransfer < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :from_location, class_name: "Location", foreign_key: :from_location_id, inverse_of: false
  belongs_to :to_location, class_name: "Location", foreign_key: :to_location_id, inverse_of: false
  belongs_to :creator, class_name: "User", foreign_key: :created_by, optional: true, inverse_of: false

  has_many :stock_transfer_items, foreign_key: :transfer_id, dependent: :destroy, inverse_of: :stock_transfer

  validates :org_id, presence: true
  validates :from_location_id, presence: true
  validates :to_location_id, presence: true
end

