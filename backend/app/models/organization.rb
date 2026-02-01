class Organization < ApplicationRecord
  has_many :users, foreign_key: :org_id, inverse_of: :organization
  has_many :roles, foreign_key: :org_id, inverse_of: :organization
end
