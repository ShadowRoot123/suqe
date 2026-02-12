class Category < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :parent, class_name: "Category", optional: true

  validates :org_id, presence: true
  validates :name, presence: true
end

