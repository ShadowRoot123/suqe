class SyncOutbox < ApplicationRecord
  self.table_name = "sync_outbox"

  validates :org_id, presence: true
  validates :client_id, presence: true
  validates :entity, presence: true
  validates :operation, presence: true
  validates :payload, presence: true
  validates :idempotency_key, presence: true
end
