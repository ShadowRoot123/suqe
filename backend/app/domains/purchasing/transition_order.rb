module Purchasing
  # The only way a purchase order's status changes. Every caller — the sync handler, the REST
  # controller, and Sprint E's receiving path — comes through here so the lifecycle table is
  # the one place that decides what is legal.
  class TransitionOrder
    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(order:, to:)
      @order = order
      @to = to
    end

    def call
      target = OrderLifecycle.validate!(from: @order.status, to: @to)

      # A replay, or a status the order is already in. Not an error: the caller asked for a
      # state the order is in, and it is.
      return @order if target == OrderLifecycle.normalize(@order.status)

      guard_approval! if target == "approved"

      @order.update!(status: target)
      @order
    end

    private

    def guard_approval!
      return if @order.purchase_items.exists?

      # Approving commits the org to buying nothing, and it would leave an order that can only
      # ever be received empty — every receipt line has to match a line on the order.
      raise OrderLifecycle::InvalidTransition,
            "A purchase order needs at least one line before it can be approved"
    end
  end
end
