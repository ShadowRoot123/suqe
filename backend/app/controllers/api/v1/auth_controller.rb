module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate!, only: :logout

      def login
        org_id = params.require(:org_id)
        email = params.require(:email)
        password = params.require(:password)

        user = User.find_by(org_id: org_id, email: email)
        return render_error(code: "invalid_credentials", message: "Invalid credentials", status: :unauthorized) if user.blank?
        return render_error(code: "invalid_credentials", message: "Invalid credentials", status: :unauthorized) unless user.authenticate(password)
        return render_error(code: "user_disabled", message: "User disabled", status: :forbidden) if user.status == "disabled"
        return render_error(code: "user_invited", message: "User not activated", status: :forbidden) if user.status == "invited"

        render json: { access_token: TokenService.issue_access_token(user) }
      end

      def logout
        head :no_content
      end
    end
  end
end
