class Return < ApplicationRecord
  self.record_timestamps = false

  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :sale, inverse_of: false
  belongs_to :location, inverse_of: false
  belongs_to :processor, class_name: "User", foreign_key: :processed_by, optional: true, inverse_of: false

  has_many :return_items, dependent: :destroy, inverse_of: :return
  has_many :refunds, dependent: :destroy, inverse_of: :return

  validates :org_id, presence: true
  validates :sale_id, presence: true
  validates :location_id, presence: true
end

