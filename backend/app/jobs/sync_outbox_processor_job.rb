class SyncOutboxProcessorJob < ApplicationJob
  queue_as :default

  def perform(org_id, limit: 100)
    OfflineSync::ProcessPending.call(org_id: org_id, limit: limit)
  end
end

