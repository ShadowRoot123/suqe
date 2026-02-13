module Api
  module V1
    class CategoriesController < ApplicationController
      before_action :authenticate!
      before_action :load_category, only: %i[show update destroy]

      def index
        require_permission!("catalog.read")
        return if performed?

        categories = Category.where(org_id: current_organization.id).order(name: :asc)

        render json: {
          categories: categories.map { |category| category_payload(category) }
        }
      end

      def show
        require_permission!("catalog.read")
        return if performed?

        render json: { category: category_payload(@category) }
      end

      def create
        require_permission!("catalog.write")
        return if performed?

        attributes = category_params
        parent_id = attributes[:parent_id]
        if parent_id.present? && !Category.where(org_id: current_organization.id, id: parent_id).exists?
          return render_error(code: "invalid_parent", message: "Invalid parent category", status: :unprocessable_entity)
        end

        category = Category.create!(attributes.merge(org_id: current_organization.id))

        render json: { category: category_payload(category) }, status: :created
      end

      def update
        require_permission!("catalog.write")
        return if performed?

        attributes = category_params
        parent_id = attributes[:parent_id]
        if parent_id.present?
          return render_error(code: "invalid_parent", message: "Invalid parent category", status: :unprocessable_entity) if parent_id == @category.id
          return render_error(code: "invalid_parent", message: "Invalid parent category", status: :unprocessable_entity) unless Category.where(org_id: current_organization.id, id: parent_id).exists?
        end

        @category.update!(attributes)

        render json: { category: category_payload(@category) }
      end

      def destroy
        require_permission!("catalog.write")
        return if performed?

        @category.destroy!
        head :no_content
      end

      private

      def load_category
        @category = Category.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def category_params
        category = params.require(:category).permit(:name, :parent_id)
        category.require(:name) if action_name == "create"
        category
      end

      def category_payload(category)
        category.slice(:id, :org_id, :parent_id, :name, :created_at, :updated_at)
      end
    end
  end
end
