module Api
  module V1
    class ReturnItemsController < ApplicationController
      before_action :authenticate!
      before_action :load_return

      def index
        require_permission!("reports.view")
        return if performed?

        items = @return.return_items.order(:id)
        render json: { return_items: items.map { |i| i.slice(:id, :return_id, :sale_item_id, :quantity, :restockable) } }
      end

      private

      def load_return
        @return = Return.find_by!(id: params[:return_id], org_id: current_organization.id)
      end
    end
  end
end

