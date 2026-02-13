module Api
  module V1
    class VariantsController < ApplicationController
      before_action :authenticate!
      before_action :load_variant, only: %i[show update destroy]

      def index
        require_permission!("catalog.read")
        return if performed?

        variants = Variant.where(org_id: current_organization.id)
        if params[:product_id].present?
          product_id = params[:product_id]
          return render_error(code: "invalid_product", message: "Invalid product", status: :unprocessable_entity) unless Product.where(org_id: current_organization.id, id: product_id).exists?
          variants = variants.where(product_id: product_id)
        end

        variants = variants.order(created_at: :desc)

        render json: {
          variants: variants.map { |variant| variant_payload(variant) }
        }
      end

      def show
        require_permission!("catalog.read")
        return if performed?

        render json: { variant: variant_payload(@variant) }
      end

      def create
        require_permission!("catalog.write")
        return if performed?

        attributes = variant_params.to_h
        variant_attributes = attributes.except("attrs", :attrs, "attributes", :attributes)
        attrs_payload = attributes["attrs"] || attributes[:attrs] || attributes["attributes"] || attributes[:attributes]
        product_id = variant_attributes["product_id"] || variant_attributes[:product_id]
        return render_error(code: "invalid_product", message: "Invalid product", status: :unprocessable_entity) unless Product.where(org_id: current_organization.id, id: product_id).exists?

        variant = Variant.new(variant_attributes.merge(org_id: current_organization.id))
        variant["attrs"] = attrs_payload if attributes.key?("attrs") || attributes.key?(:attrs) || attributes.key?("attributes") || attributes.key?(:attributes)
        variant.save!

        render json: { variant: variant_payload(variant) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        require_permission!("catalog.write")
        return if performed?

        attributes = variant_params.to_h
        variant_attributes = attributes.except("attrs", :attrs, "attributes", :attributes)
        attrs_payload = attributes["attrs"] || attributes[:attrs] || attributes["attributes"] || attributes[:attributes]
        product_id = variant_attributes["product_id"] || variant_attributes[:product_id]
        if product_id.present? && !Product.where(org_id: current_organization.id, id: product_id).exists?
          return render_error(code: "invalid_product", message: "Invalid product", status: :unprocessable_entity)
        end

        @variant.assign_attributes(variant_attributes)
        @variant["attrs"] = attrs_payload if attributes.key?("attrs") || attributes.key?(:attrs) || attributes.key?("attributes") || attributes.key?(:attributes)
        @variant.save!

        render json: { variant: variant_payload(@variant) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("catalog.write")
        return if performed?

        @variant.destroy!
        head :no_content
      end

      private

      def load_variant
        @variant = Variant.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def variant_params
        variant = params.require(:variant).permit(:product_id, :sku, :barcode, :price, :cost_price, attrs: {}, attributes: {})
        variant.require(:product_id) if action_name == "create"
        variant.require(:sku) if action_name == "create"
        variant
      end

      def variant_payload(variant)
        variant.slice(:id, :org_id, :product_id, :sku, :barcode, :attrs, :price, :cost_price, :created_at, :updated_at)
      end
    end
  end
end

