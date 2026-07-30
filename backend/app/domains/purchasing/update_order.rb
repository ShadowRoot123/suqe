module Purchasing
  # Edits a draft order. Only the keys the caller actually names are touched, so a command that
  # carries just `expected_at` cannot blank out the lines — the same rule every other sync
  # handler follows, and the reason `items: nil` and `items: []` mean different things here
  # (leave the lines alone vs. empty the order).
  class UpdateOrder
    EDITABLE_KEYS = %i[supplier_id location_id expected_at items].freeze

    def self.call(**kwargs)
      new(**kwargs).call
    end

    def self.edits?(attrs)
      attrs.symbolize_keys.keys.intersect?(EDITABLE_KEYS)
    end

    def initialize(order:, attrs:)
      @order = order
      @attrs = attrs.symbolize_keys.slice(*EDITABLE_KEYS)
    end

    def call
      unless OrderLifecycle.editable?(@order.status)
        # Receiving is matched against these lines, so they stop being editable the moment the
        # order leaves draft. Cancel or short-close it and raise a new one instead.
        raise OrderLifecycle::InvalidTransition,
              "Cannot edit a purchase order that is #{@order.status}"
      end

      updates = {}
      if @attrs.key?(:supplier_id)
        supplier_id = @attrs[:supplier_id].presence
        raise ArgumentError, "Missing field: supplier_id" if supplier_id.blank?
        raise ArgumentError, "Invalid supplier" unless Supplier.where(org_id: @order.org_id, id: supplier_id).exists?

        updates[:supplier_id] = supplier_id
      end
      if @attrs.key?(:location_id)
        location_id = @attrs[:location_id].presence
        raise ArgumentError, "Missing field: location_id" if location_id.blank?
        raise ArgumentError, "Invalid location" unless Location.where(org_id: @order.org_id, id: location_id).exists?

        updates[:location_id] = location_id
      end
      updates[:expected_at] = @attrs[:expected_at].presence if @attrs.key?(:expected_at)

      rows = OrderLines.normalize(@attrs[:items], org_id: @order.org_id) if @attrs.key?(:items)

      ActiveRecord::Base.transaction(requires_new: true) do
        updates[:total_cost] = OrderLines.replace!(@order, rows) if rows
        @order.update!(updates) if updates.any?
      end

      @order
    end
  end
end
