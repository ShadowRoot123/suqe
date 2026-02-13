module Api
  module V1
    class SuppliersController < ApplicationController
      before_action :authenticate!
      before_action :load_supplier, only: %i[show update destroy]

      def index
        require_permission!("purchasing.read")
        return if performed?

        suppliers = Supplier.where(org_id: current_organization.id).order(name: :asc)
        render json: { suppliers: suppliers.map { |supplier| supplier_payload(supplier) } }
      end

      def show
        require_permission!("purchasing.read")
        return if performed?

        render json: { supplier: supplier_payload(@supplier) }
      end

      def create
        require_permission!("purchasing.write")
        return if performed?

        supplier = Supplier.create!(supplier_params.merge(org_id: current_organization.id))
        render json: { supplier: supplier_payload(supplier) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def update
        require_permission!("purchasing.write")
        return if performed?

        @supplier.update!(supplier_params)
        render json: { supplier: supplier_payload(@supplier) }
      rescue ActiveRecord::RecordNotUnique
        render_error(code: "not_unique", message: "Record already exists", status: :conflict)
      end

      def destroy
        require_permission!("purchasing.write")
        return if performed?

        @supplier.destroy!
        head :no_content
      rescue ActiveRecord::InvalidForeignKey
        render_error(code: "invalid_foreign_key", message: "Record is referenced by other records", status: :conflict)
      end

      private

      def load_supplier
        @supplier = Supplier.find_by!(id: params[:id], org_id: current_organization.id)
      end

      def supplier_params
        supplier = params.require(:supplier).permit(:name, :phone, :email, :address)
        supplier.require(:name) if action_name == "create"
        supplier
      end

      def supplier_payload(supplier)
        supplier.slice(:id, :org_id, :name, :phone, :email, :address, :created_at, :updated_at)
      end
    end
  end
end

