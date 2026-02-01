module Api
  module V1
    class OrganizationsController < ApplicationController
      def create
        organization = Organization.create!(organization_params)
        owner = organization.users.create!(
          name: owner_params.fetch(:name),
          email: owner_params.fetch(:email),
          password: owner_params.fetch(:password),
          status: "active"
        )

        owner_role = organization.roles.create!(name: "Owner")
        permission_ids = Permission.pluck(:id)
        if permission_ids.any?
          connection = ActiveRecord::Base.connection
          permission_ids.each do |permission_id|
            connection.execute <<~SQL
              INSERT INTO role_permissions (role_id, permission_id)
              VALUES (#{connection.quote(owner_role.id)}, #{connection.quote(permission_id)})
              ON CONFLICT DO NOTHING;
            SQL
          end
        end
        UserRole.create!(user_id: owner.id, role_id: owner_role.id)

        render json: {
          organization: organization.slice(:id, :name, :currency, :tax_mode, :created_at, :updated_at),
          user: owner.slice(:id, :org_id, :name, :email, :status, :created_at, :updated_at),
          access_token: TokenService.issue_access_token(owner)
        }, status: :created
      end

      private

      def organization_params
        params.require(:name)
        params.permit(:name, :currency, :tax_mode)
      end

      def owner_params
        owner = params.require(:owner).permit(:name, :email, :password)
        owner.require(:name)
        owner.require(:email)
        owner.require(:password)
        owner
      end
    end
  end
end
