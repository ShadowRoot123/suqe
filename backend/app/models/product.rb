class Product < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :category, optional: true

  validates :org_id, presence: true
  validates :name, presence: true
end

