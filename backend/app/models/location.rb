class Location < ApplicationRecord
  self.inheritance_column = :_type_disabled

  belongs_to :organization, foreign_key: :org_id, inverse_of: false

  validates :org_id, presence: true
  validates :name, presence: true
  validates :type, presence: true
end

