class ProductGroup < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false

  has_many :product_group_memberships, dependent: :destroy
  has_many :products, through: :product_group_memberships

  validates :org_id, presence: true
  validates :name, presence: true
end

