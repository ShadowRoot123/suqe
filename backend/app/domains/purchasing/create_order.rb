module Purchasing
  # The only way a purchase order enters the system. An order starts as a `draft` with any
  # number of lines (including none — you open the order, then add to it) and its total is
  # always derived from the lines, never taken from the caller.
  class CreateOrder
    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(org_id:, supplier_id:, location_id:, id: nil, expected_at: nil, items: nil, created_by: nil)
      @org_id = org_id
      @id = id.presence
      @supplier_id = supplier_id.presence
      @location_id = location_id.presence
      @expected_at = expected_at
      @items = items
      @created_by = created_by.presence
    end

    def call
      validate!
      rows = OrderLines.normalize(@items, org_id: @org_id)

      begin
        ActiveRecord::Base.transaction(requires_new: true) do
          order = PurchaseOrder.create!(
            {
              id: @id,
              org_id: @org_id,
              supplier_id: @supplier_id,
              location_id: @location_id,
              status: "draft",
              expected_at: @expected_at.presence,
              created_by: @created_by,
              total_cost: 0
            }.compact
          )
          total = OrderLines.replace!(order, rows)
          order.update!(total_cost: total)
          order
        end
      rescue ActiveRecord::RecordNotUnique
        # The device is replaying the command it already got an ack for. An order has no natural
        # key, so the only collision possible is on the client-generated id, and the order that
        # won is the one that was asked for. Reachable only from inside the savepoint above.
        existing = @id.present? ? PurchaseOrder.find_by(org_id: @org_id, id: @id) : nil
        raise if existing.blank?

        existing
      end
    end

    private

    def validate!
      raise ArgumentError, "Missing field: supplier_id" if @supplier_id.blank?
      raise ArgumentError, "Missing field: location_id" if @location_id.blank?
      raise ArgumentError, "Invalid supplier" unless uuid?(@supplier_id)
      raise ArgumentError, "Invalid location" unless uuid?(@location_id)
      raise ArgumentError, "Invalid supplier" unless Supplier.where(org_id: @org_id, id: @supplier_id).exists?
      raise ArgumentError, "Invalid location" unless Location.where(org_id: @org_id, id: @location_id).exists?
    end

    def uuid?(value)
      Inventory::RecordMovement::UUID_FORMAT.match?(value.to_s)
    end
  end
end
