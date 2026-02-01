module OfflineSync
  class EnqueueBatch
    def self.call(org_id:, client_id:, commands:)
      new(org_id:, client_id:, commands:).call
    end

    def initialize(org_id:, client_id:, commands:)
      @org_id = org_id
      @client_id = client_id
      @commands = commands
      @connection = ActiveRecord::Base.connection
    end

    def call
      outcomes = @commands.map { |command| enqueue_one(command) }
      { outcomes: outcomes }
    end

    private

    attr_reader :org_id, :client_id, :connection

    def enqueue_one(command)
      command_hash = normalize_hash(command)
      idempotency_key = fetch_key(command_hash, :idempotency_key)
      entity = fetch_key(command_hash, :entity)
      operation = fetch_key(command_hash, :operation)
      payload = fetch_key(command_hash, :payload)

      missing = []
      missing << "entity" if entity.blank?
      missing << "operation" if operation.blank?
      missing << "payload" if payload.blank?
      missing << "idempotency_key" if idempotency_key.blank?

      if missing.any?
        return {
          idempotency_key: idempotency_key,
          status: "invalid",
          error: "Missing fields: #{missing.join(', ')}"
        }
      end

      inserted_id = insert_outbox_row(
        idempotency_key: idempotency_key,
        entity: entity,
        operation: operation,
        payload: payload
      )

      if inserted_id.present?
        return { idempotency_key: idempotency_key, status: "enqueued", outbox_id: inserted_id }
      end

      existing_id = find_outbox_id(idempotency_key: idempotency_key)
      { idempotency_key: idempotency_key, status: "duplicate", outbox_id: existing_id }
    end

    def fetch_key(hash, key)
      hash[key.to_s] || hash[key]
    end

    def normalize_hash(value)
      return value if value.is_a?(Hash)
      return value.to_unsafe_h if value.respond_to?(:to_unsafe_h)
      return value.to_h if value.respond_to?(:to_h)

      {}
    end

    def insert_outbox_row(idempotency_key:, entity:, operation:, payload:)
      payload_hash = normalize_hash(payload)
      payload_json = payload_hash.to_json

      result = connection.execute <<~SQL
        INSERT INTO sync_outbox (id, org_id, client_id, entity, operation, payload, idempotency_key, status, retry_count, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          #{connection.quote(org_id)},
          #{connection.quote(client_id)},
          #{connection.quote(entity)},
          #{connection.quote(operation)},
          #{connection.quote(payload_json)}::jsonb,
          #{connection.quote(idempotency_key)},
          'pending',
          0,
          now(),
          now()
        )
        ON CONFLICT (org_id, idempotency_key) DO NOTHING
        RETURNING id;
      SQL

      row = result.first
      row&.fetch("id", nil)
    end

    def find_outbox_id(idempotency_key:)
      result = connection.execute <<~SQL
        SELECT id
        FROM sync_outbox
        WHERE org_id = #{connection.quote(org_id)}
          AND idempotency_key = #{connection.quote(idempotency_key)}
        LIMIT 1;
      SQL

      result.first&.fetch("id", nil)
    end
  end
end
