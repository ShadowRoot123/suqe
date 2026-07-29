module Api
  module V1
    class ProductsController < ApplicationController
      before_action :authenticate!
      before_action :load_product, only: %i[show update destroy]
 
      def index
        require_permission!("catalog.read")
        return if performed?
 
        products = Product.where(org_id: current_organization.id).order(created_at: :desc)

        status = params[:status].presence
        if status.present?
          unless Product::STATUSES.include?(status)
            return render_error(code: "invalid_status", message: "Invalid status", status: :unprocessable_entity)
          end

          products = products.where(status: status)
        end

        render json: {
          products: products.map { |product| product_payload(product) }
        }
      end
 
      def show
        require_permission!("catalog.read")
        return if performed?
 
        render json: { product: product_payload(@product) }
      end
 
      def create
        require_permission!("catalog.write")
        return if performed?
 
        attributes = product_params
        category_id = attributes[:category_id]
        if category_id.present? && !Category.where(org_id: current_organization.id, id: category_id).exists?
          return render_error(code: "invalid_category", message: "Invalid category", status: :unprocessable_entity)
        end
 
        product = Product.create!(attributes.merge(org_id: current_organization.id))
 
        render json: { product: product_payload(product) }, status: :created
      end
 
      def update
        require_permission!("catalog.write")
        return if performed?
 
        attributes = product_params
        category_id = attributes[:category_id]
        if category_id.present? && !Category.where(org_id: current_organization.id, id: category_id).exists?
          return render_error(code: "invalid_category", message: "Invalid category", status: :unprocessable_entity)
        end
 
        @product.update!(attributes)
 
        render json: { product: product_payload(@product) }
      end
 
      def destroy
        require_permission!("catalog.write")
        return if performed?
 
        @product.update!(status: "archived")
 
        render json: { product: product_payload(@product) }
      end
 
      private
 
      def load_product
        @product = Product.find_by!(id: params[:id], org_id: current_organization.id)
      end
 
      def product_params
        product = params.require(:product).permit(:name, :category_id, :status)
        product.require(:name) if action_name == "create"
        product
      end
 
      def product_payload(product)
        product.slice(:id, :org_id, :category_id, :name, :status, :created_at, :updated_at)
      end
    end
  end
end
