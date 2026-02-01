class Role < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: :roles

  has_many :user_roles, foreign_key: :role_id, inverse_of: :role
  has_many :users, through: :user_roles

  has_many :role_permissions, foreign_key: :role_id, inverse_of: :role
  has_many :permissions, through: :role_permissions

  validates :name, presence: true
end
