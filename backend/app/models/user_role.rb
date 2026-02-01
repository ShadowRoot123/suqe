class UserRole < ApplicationRecord
  self.primary_key = nil

  belongs_to :user, foreign_key: :user_id, inverse_of: :user_roles
  belongs_to :role, foreign_key: :role_id, inverse_of: :user_roles
end
