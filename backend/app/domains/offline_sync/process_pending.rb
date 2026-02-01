module OfflineSync
  class ProcessPending
    SUPPORTED_OPERATIONS = %w[create update delete].freeze

    def self.call(org_id:, limit: 100)
      new(org_id:, limit:).call
    end

    def initialize(org_id:, limit:)
      @org_id = org_id
      @limit = limit
    end

    def call
      processed = []

      SyncOutbox.transaction do
        items = SyncOutbox
          .where(org_id: @org_id, status: "pending")
          .order(:created_at)
          .limit(@limit)
          .lock("FOR UPDATE SKIP LOCKED")

        items.each do |item|
          item.update!(status: "processing")
          item.update!(status: next_status_for(item))
          processed << item.id
        end
      end

      { processed_ids: processed }
    end

    private

    def next_status_for(item)
      return "failed" unless SUPPORTED_OPERATIONS.include?(item.operation)

      "applied"
    end
  end
end

