module Api
  module V1
    class AuditLogsController < ApplicationController
      before_action :authenticate!
      before_action :load_audit_log, only: %i[show]

      def index
        require_permission!("org.manage")
        return if performed?

        logs = AuditLog.where(org_id: current_organization.id).order(created_at: :desc)
        logs = logs.where(entity: params[:entity]) if params[:entity].present?
        logs = logs.where(entity_id: params[:entity_id]) if params[:entity_id].present?
        render json: { audit_logs: logs.limit(200).map { |log| audit_log_payload(log) } }
      end

      def show
        require_permission!("org.manage")
        return if performed?

        render json: { audit_log: audit_log_payload(@audit_log) }
      end

      private

      def load_audit_log
        @audit_log = AuditLog.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def audit_log_payload(log)
        log.slice(:id, :org_id, :actor_user_id, :action, :entity, :entity_id, :metadata, :created_at)
      end
    end
  end
end

