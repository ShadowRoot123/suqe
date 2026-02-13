class Refund < ApplicationRecord
  self.record_timestamps = false

  belongs_to :return, inverse_of: :refunds

  validates :return_id, presence: true
  validates :method, presence: true
  validates :amount, presence: true
end

