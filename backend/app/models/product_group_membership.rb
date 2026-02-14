class ProductGroupMembership < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :product_group
  belongs_to :product

  validates :org_id, presence: true
  validates :product_group_id, presence: true
  validates :product_id, presence: true

  validate :org_scopes_match

  private

  def org_scopes_match
    return if product_group.blank? || product.blank?
    return if product_group.org_id == org_id && product.org_id == org_id

    errors.add(:base, "Organization mismatch")
  end
end

