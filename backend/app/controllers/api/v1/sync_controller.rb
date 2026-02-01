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

        result = OfflineSync::EnqueueBatch.call(
          org_id: current_organization.id,
          client_id: device_id,
          commands: commands
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

        next_cursor = (items.last&.updated_at || Time.current).iso8601(6)

        render json: { cursor: cursor, next_cursor: next_cursor, changes: [], acks: acks }
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
