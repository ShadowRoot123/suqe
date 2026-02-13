module Api
  module V1
    class RolesController < ApplicationController
      before_action :authenticate!
      before_action :load_role, only: %i[show update destroy]

      def index
        require_permission!("users.manage_roles")
        return if performed?

        roles = Role.where(org_id: current_organization.id).order(name: :asc)
        render json: { roles: roles.map { |role| role_payload(role) } }
      end

      def show
        require_permission!("users.manage_roles")
        return if performed?

        render json: { role: role_payload(@role) }
      end

      def create
        require_permission!("users.manage_roles")
        return if performed?

        role = Role.create!(role_params.merge(org_id: current_organization.id))
        assign_permissions!(role, Array(params[:permission_keys]).compact) if params.key?(:permission_keys)
        render json: { role: role_payload(role) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        require_permission!("users.manage_roles")
        return if performed?

        @role.update!(role_params)
        assign_permissions!(@role, Array(params[:permission_keys]).compact) if params.key?(:permission_keys)
        render json: { role: role_payload(@role) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("users.manage_roles")
        return if performed?

        @role.destroy!
        head :no_content
      rescue ActiveRecord::InvalidForeignKey
        render_error(code: "invalid_foreign_key", message: "Record is referenced by other records", status: :conflict)
      end

      private

      def load_role
        @role = Role.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def role_params
        role = params.require(:role).permit(:name)
        role.require(:name) if action_name == "create"
        role
      end

      def assign_permissions!(role, permission_keys)
        connection = ActiveRecord::Base.connection
        connection.execute("DELETE FROM role_permissions WHERE role_id = #{connection.quote(role.id)}")

        keys = permission_keys.map(&:to_s).map(&:strip).reject(&:blank?).uniq
        return if keys.empty?

        permission_ids = Permission.where(key: keys).pluck(:id)
        permission_ids.each do |permission_id|
          connection.execute <<~SQL
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (#{connection.quote(role.id)}, #{connection.quote(permission_id)})
            ON CONFLICT DO NOTHING;
          SQL
        end
      end

      def role_payload(role)
        payload = role.slice(:id, :org_id, :name, :created_at, :updated_at)
        payload[:permission_keys] = role.permissions.order(:key).pluck(:key)
        payload
      end
    end
  end
end

