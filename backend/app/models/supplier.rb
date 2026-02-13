class Supplier < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false

  validates :org_id, presence: true
  validates :name, presence: true
end

