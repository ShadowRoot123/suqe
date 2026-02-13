class PurchaseReceipt < ApplicationRecord
  belongs_to :organization, foreign_key: :org_id, inverse_of: false
  belongs_to :purchase_order, inverse_of: false
  belongs_to :receiver, class_name: "User", foreign_key: :received_by, optional: true, inverse_of: false

  has_many :purchase_receipt_items, foreign_key: :receipt_id, dependent: :destroy, inverse_of: :purchase_receipt

  validates :org_id, presence: true
  validates :purchase_order_id, presence: true
end

