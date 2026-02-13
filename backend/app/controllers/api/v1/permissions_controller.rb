module Api
  module V1
    class PermissionsController < ApplicationController
      before_action :authenticate!

      def index
        require_permission!("users.manage_roles")
        return if performed?

        render json: { permissions: Permission.order(:key).pluck(:key) }
      end
    end
  end
end

