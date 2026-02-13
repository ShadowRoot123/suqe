module Api
  module V1
    class SyncOutboxController < ApplicationController
      before_action :authenticate!
      before_action :load_entry, only: %i[show]

      def index
        require_permission!("org.manage")
        return if performed?

        entries = SyncOutbox.where(org_id: current_organization.id).order(created_at: :asc)
        entries = entries.where(status: params[:status]) if params[:status].present?
        render json: { sync_outbox: entries.limit(200).map { |e| entry_payload(e) } }
      end

      def show
        require_permission!("org.manage")
        return if performed?

        render json: { entry: entry_payload(@entry) }
      end

      private

      def load_entry
        @entry = SyncOutbox.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def entry_payload(entry)
        entry.slice(:id, :org_id, :client_id, :entity, :operation, :payload, :idempotency_key, :status, :retry_count, :created_at, :updated_at)
      end
    end
  end
end

