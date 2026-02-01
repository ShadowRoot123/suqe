class Permission < ApplicationRecord
  validates :key, presence: true, uniqueness: true

  has_many :role_permissions, foreign_key: :permission_id, inverse_of: :permission
  has_many :roles, through: :role_permissions
end
