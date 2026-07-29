class Product < ApplicationRecord
  # Mirrors the product_status pg enum. Validating here turns a bad status into a 422 (and a
  # clean sync failure) instead of a raw StatementInvalid from the database.
  STATUSES = %w[active archived].freeze

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :category, optional: true

  scope :active, -> { where(status: "active") }

  validates :org_id, presence: true
  validates :name, presence: true
  validates :status, inclusion: { in: STATUSES }
end

