class Sale < ApplicationRecord
  # Mirrors the sale_status pg enum. Validating here turns a bad status into a 422 (and a clean
  # sync failure) instead of a raw StatementInvalid, the same as PurchaseOrder::STATUSES.
  STATUSES = %w[completed voided].freeze

  # A sale can only be undone from `completed`. `voided` is terminal — un-voiding is a new sale.
  VOIDABLE_STATUSES = %w[completed].freeze

  self.record_timestamps = false

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :location, inverse_of: false
  belongs_to :cashier, class_name: "User", foreign_key: :cashier_id, optional: true, inverse_of: false

  has_many :sale_items, dependent: :destroy, inverse_of: :sale
  has_many :payments, dependent: :destroy, inverse_of: :sale

  validates :org_id, presence: true
  validates :location_id, presence: true
  validates :status, inclusion: { in: STATUSES }

  def voidable?
    VOIDABLE_STATUSES.include?(status)
  end
end

