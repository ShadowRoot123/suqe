class RolePermission < ApplicationRecord
  self.primary_key = nil

  belongs_to :role, foreign_key: :role_id, inverse_of: :role_permissions
  belongs_to :permission, foreign_key: :permission_id, inverse_of: :role_permissions
end
