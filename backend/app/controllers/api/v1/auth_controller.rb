module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate!, only: :logout

      def login
        email = params.require(:email)
        password = params.require(:password)

        org_id = params[:org_id]
        user =
          if org_id.present?
            User.find_by(org_id:, email:)
          else
            candidates = User.where(email:).to_a
            matches = candidates.select { |u| u.authenticate(password) }
            if matches.length > 1
              orgs = Organization.where(id: matches.map(&:org_id).uniq).select(:id, :name).order(:name).to_a
              return render_error(
                code: "multiple_organizations",
                message: "Multiple organizations found for this email",
                status: :conflict,
                details: { organizations: orgs.map { |o| { id: o.id, name: o.name } } }
              )
            end
            matches.first
          end

        return render_error(code: "invalid_credentials", message: "Invalid credentials", status: :unauthorized) if user.blank?
        return render_error(code: "invalid_credentials", message: "Invalid credentials", status: :unauthorized) unless user.authenticate(password)
        return render_error(code: "user_disabled", message: "User disabled", status: :forbidden) if user.status == "disabled"
        return render_error(code: "user_invited", message: "User not activated", status: :forbidden) if user.status == "invited"

        render json: { access_token: TokenService.issue_access_token(user), org_id: user.org_id, email: user.email }
      end

      def logout
        head :no_content
      end
    end
  end
end
