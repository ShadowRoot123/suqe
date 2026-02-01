class User < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: :users

  has_many :user_roles, foreign_key: :user_id, inverse_of: :user
  has_many :roles, through: :user_roles

  has_secure_password validations: false

  validates :email, presence: true
  validates :name, presence: true
end
