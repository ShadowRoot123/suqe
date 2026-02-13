module Api
  module V1
    class LocationsController < ApplicationController
      before_action :authenticate!
      before_action :load_location, only: %i[show update destroy]

      def index
        require_permission!("locations.read")
        return if performed?

        locations = Location.where(org_id: current_organization.id).order(name: :asc)
        render json: { locations: locations.map { |location| location_payload(location) } }
      end

      def show
        require_permission!("locations.read")
        return if performed?

        render json: { location: location_payload(@location) }
      end

      def create
        require_permission!("locations.write")
        return if performed?

        location = Location.create!(location_params.merge(org_id: current_organization.id))
        render json: { location: location_payload(location) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        require_permission!("locations.write")
        return if performed?

        @location.update!(location_params)
        render json: { location: location_payload(@location) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("locations.write")
        return if performed?

        @location.destroy!
        head :no_content
      end

      private

      def load_location
        @location = Location.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def location_params
        location = params.require(:location).permit(:name, :type, :address)
        if action_name == "create"
          location.require(:name)
          location.require(:type)
        end
        location
      end

      def location_payload(location)
        location.slice(:id, :org_id, :name, :type, :address, :created_at, :updated_at)
      end
    end
  end
end

