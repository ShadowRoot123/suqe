module Api
  module V1
    class SyncController < ApplicationController
      before_action :authenticate!

      def push
        device_id = params[:device_id]
        if device_id.blank?
          return render_error(
            code: "parameter_missing",
            message: "param is missing or the value is empty: device_id",
            status: :bad_request
          )
        end

        commands = params[:commands]
        if commands.blank?
          return render_error(
            code: "parameter_missing",
            message: "param is missing or the value is empty: commands",
            status: :bad_request
          )
        end

        unless commands.is_a?(Array)
          return render_error(
            code: "validation_error",
            message: "Validation failed",
            status: :unprocessable_entity,
            details: { commands: [ "must be an array" ] }
          )
        end

        # No blanket `require_permission!` here: a push is a *batch*, and which permission each
        # command needs depends on what it is. `EnqueueBatch` checks them one at a time and
        # refuses only what this caller may not issue — see `OfflineSync::CommandPermissions`.
        result = OfflineSync::EnqueueBatch.call(
          org_id: current_organization.id,
          client_id: device_id,
          commands: commands,
          user: current_user
        )

        render json: {
          received_at: Time.current.iso8601(6),
          outcomes: result.fetch(:outcomes)
        }
      end

      def pull
        cursor = params[:cursor].presence
        limit = params[:limit].presence&.to_i || 100
        limit = 1 if limit < 1
        limit = 500 if limit > 500

        OfflineSync::ProcessPending.call(org_id: current_organization.id, limit: limit)

        since = cursor.present? ? Time.iso8601(cursor) : nil

        scope = SyncOutbox
          .where(org_id: current_organization.id, status: %w[applied failed])
          .order(updated_at: :asc)

        scope = scope.where("updated_at > ?", since) if since.present?

        items = scope.limit(limit)
        acks = items.map do |item|
          {
            idempotency_key: item.idempotency_key,
            status: item.status,
            outbox_id: item.id,
            processed_at: item.updated_at.iso8601(6)
          }
        end

        log_scope = AuditLog.where(org_id: current_organization.id).order(created_at: :asc)
        log_scope = log_scope.where("created_at > ?", since) if since.present?

        logs = log_scope.limit(limit)
        changes = logs.map do |log|
          {
            id: log.id,
            action: log.action,
            entity: log.entity,
            entity_id: log.entity_id,
            created_at: log.created_at.iso8601(6),
            metadata: log.metadata
          }
        end

        last_ack_time = items.last&.updated_at
        last_change_time = logs.last&.created_at
        next_cursor_time = [last_ack_time, last_change_time, Time.current].compact.max
        next_cursor = next_cursor_time.iso8601(6)

        render json: { cursor: cursor, next_cursor: next_cursor, changes: changes, acks: acks }
      rescue ArgumentError
        render_error(
          code: "validation_error",
          message: "Validation failed",
          status: :unprocessable_entity,
          details: { cursor: [ "must be ISO8601" ] }
        )
      end
    end
  end
end
