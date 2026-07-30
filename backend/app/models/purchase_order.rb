class PurchaseOrder < ApplicationRecord
  # Mirrors the purchase_order_status pg enum; the transitions between these live in
  # Purchasing::OrderLifecycle. Validating here turns a bad status into a 422 (and a clean sync
  # failure) instead of a raw StatementInvalid from the database.
  STATUSES = Purchasing::OrderLifecycle::STATUSES

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :supplier, inverse_of: false
  belongs_to :location, inverse_of: false
  belongs_to :creator, class_name: "User", foreign_key: :created_by, optional: true, inverse_of: false

  has_many :purchase_items, dependent: :destroy, inverse_of: :purchase_order

  validates :org_id, presence: true
  validates :supplier_id, presence: true
  validates :location_id, presence: true
  validates :status, inclusion: { in: STATUSES }
end
