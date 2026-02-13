class Payment < ApplicationRecord
  self.record_timestamps = false

  belongs_to :sale, inverse_of: :payments

  validates :sale_id, presence: true
  validates :method, presence: true
  validates :amount, presence: true
end

