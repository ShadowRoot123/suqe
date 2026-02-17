module Api
  module V1
    class MeController < ApplicationController
      before_action :authenticate!

      def show
        roles = current_user.roles
        permission_keys = roles.joins(:permissions).distinct.order("permissions.key").pluck("permissions.key")

        render json: {
          user: current_user.slice(:id, :org_id, :name, :email, :status),
          role_ids: roles.order(:name).pluck(:id),
          role_names: roles.order(:name).pluck(:name),
          permissions: permission_keys
        }
      end
    end
  end
end

