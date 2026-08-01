module Purchasing
  # The only way a purchase order's status changes. Every caller — the sync handler, the REST
  # controller, and the receiving path — comes through here so the lifecycle table is the one
  # place that decides what is legal.
  class TransitionOrder
    def self.call(**kwargs)
      new(**kwargs).call
    end

    # `by_receipt` is ReceiveOrder announcing itself. Only it may move an order into a
    # receipt-driven status, because only it has written the movements that status claims.
    def initialize(order:, to:, by_receipt: false)
      @order = order
      @to = to
      @by_receipt = by_receipt
    end

    def call
      target = OrderLifecycle.validate!(from: @order.status, to: @to)

      # A replay, or a status the order is already in. Not an error: the caller asked for a
      # state the order is in, and it is.
      return @order if target == OrderLifecycle.normalize(@order.status)

      guard_approval! if target == "approved"
      guard_receipt_driven!(target)

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

    def guard_receipt_driven!(target)
      return if @by_receipt
      return unless OrderLifecycle.receipt_driven?(target)

      # Otherwise the order would read "received" with nothing in the ledger behind it — the
      # inventory error this whole pipeline exists to prevent. A short delivery closes instead.
      raise OrderLifecycle::InvalidTransition,
            "A purchase order becomes #{target} by receiving against it, not by setting its status"
    end
  end
end
