module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate!, only: :invite

      def invite
        require_permission!("users.invite")
        return if performed?

        email = params.require(:email)
        name = params.require(:name)
        role_ids = Array(params[:role_ids]).compact

        if role_ids.any?
          require_permission!("users.manage_roles")
          return if performed?
        end

        user = User.create!(org_id: current_organization.id, email: email, name: name, status: "invited")

        if role_ids.any?
          valid_role_ids = Role.where(org_id: current_organization.id, id: role_ids).pluck(:id)
          if valid_role_ids.any?
            connection = ActiveRecord::Base.connection
            valid_role_ids.each do |role_id|
              connection.execute <<~SQL
                INSERT INTO user_roles (user_id, role_id)
                VALUES (#{connection.quote(user.id)}, #{connection.quote(role_id)})
                ON CONFLICT DO NOTHING;
              SQL
            end
          end
        end

        render json: {
          user: user.slice(:id, :org_id, :name, :email, :status, :created_at, :updated_at),
          invite_token: TokenService.issue_invite_token(user)
        }, status: :created
      end

      def accept_invite
        token = params.require(:token)
        password = params.require(:password)

        payload = TokenService.verify_invite_token(token)
        return render_error(code: "invalid_invite_token", message: "Invalid invite token", status: :bad_request) if payload.blank?

        user = User.find_by(id: payload[:user_id], org_id: payload[:org_id])
        return render_error(code: "invalid_invite_token", message: "Invalid invite token", status: :bad_request) if user.blank?
        return render_error(code: "invite_already_used", message: "Invite already used", status: :unprocessable_entity) if user.status != "invited"

        user.update!(password: password, status: "active")

        render json: { access_token: TokenService.issue_access_token(user) }
      end
    end
  end
end
