module Purchasing
  # Receiving goods against a purchase order: the receipt, its lines, one `purchase` movement
  # per line, and the order's resulting status — all in one transaction, or none of it.
  #
  # This is the only place a purchase order reaches `partially_received` or `received`, because
  # it is the only place that writes the movements those statuses claim. Both surfaces come
  # through here: the REST controller and the `purchase_receipt` sync command.
  #
  # Replay-safe twice over. The receipt is looked up by its client id and by the command's
  # idempotency key before anything is written, and every movement carries a key derived from
  # the receipt id, so a command that arrives twice books stock in once.
  class ReceiveOrder
    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(org_id:, purchase_order_id:, items:, id: nil, received_at: nil,
                   received_by: nil, idempotency_key: nil)
      @org_id = org_id
      @id = id.presence
      @purchase_order_id = purchase_order_id.presence
      @items = items
      @received_at = received_at
      @received_by = received_by.presence
      @idempotency_key = idempotency_key.presence
    end

    def call
      existing = find_existing
      return existing if existing

      order = load_order!
      received_at = Iso8601Time.parse(@received_at, field: "received_at")
      rows = ReceiptLines.normalize(
        @items,
        ordered: order.purchase_items.index_by(&:variant_id),
        already_received: ReceiptLines.received_by_variant(order)
      )

      begin
        ActiveRecord::Base.transaction(requires_new: true) do
          receipt = PurchaseReceipt.create!(
            {
              id: @id,
              org_id: @org_id,
              # The order object rather than its id: `belongs_to` loads and caches it to validate
              # presence, and settle_status! is about to change its status. Handing over the
              # instance being transitioned is what stops a caller reading the receipt's order
              # back as `approved` a moment after it became `received`.
              purchase_order: order,
              received_at: received_at,
              received_by: @received_by,
              idempotency_key: @idempotency_key
            }.compact
          )

          rows.each { |row| book_in!(receipt, order, row) }
          settle_status!(order)

          receipt
        end
      rescue ActiveRecord::RecordNotUnique
        # A concurrent replay: the winner already booked the stock in. Reachable only from
        # inside the savepoint above, which is what lets this lookup run at all.
        duplicate = find_existing
        raise if duplicate.blank?

        duplicate
      end
    end

    private

    # Either the device is replaying a command it already got an ack for (same receipt id), or
    # the same command arrived under a second outbox row (same idempotency key). Both mean the
    # goods are already in the ledger.
    def find_existing
      by_id = @id.present? ? PurchaseReceipt.find_by(org_id: @org_id, id: @id) : nil
      return by_id if by_id.present?
      return nil if @idempotency_key.blank?

      PurchaseReceipt.find_by(org_id: @org_id, idempotency_key: @idempotency_key)
    end

    def load_order!
      raise ArgumentError, "Missing field: purchase_order_id" if @purchase_order_id.blank?
      raise ArgumentError, "Invalid purchase order" unless uuid?(@purchase_order_id)

      order = PurchaseOrder.find_by(org_id: @org_id, id: @purchase_order_id)
      raise ArgumentError, "Invalid purchase order" if order.blank?

      unless OrderLifecycle.receivable?(order.status)
        # A draft has never been sent to the supplier, and a closed or cancelled order is done.
        raise OrderLifecycle::InvalidTransition,
              "Cannot receive against a purchase order that is #{order.status}"
      end

      order
    end

    def book_in!(receipt, order, row)
      PurchaseReceiptItem.create!(
        {
          id: row[:id],
          receipt_id: receipt.id,
          variant_id: row.fetch(:variant_id),
          quantity_received: row.fetch(:quantity_received),
          unit_cost: row.fetch(:unit_cost)
        }.compact
      )

      # Stock lands where the order said it would be delivered. Keyed off the receipt id rather
      # than the command, so a receipt that reaches the server twice by two different routes
      # still moves stock once.
      Inventory::RecordMovement.call(
        org_id: @org_id,
        variant_id: row.fetch(:variant_id),
        location_id: order.location_id,
        type: "purchase",
        quantity_delta: row.fetch(:quantity_received),
        reference_type: "PurchaseReceipt",
        reference_id: receipt.id,
        created_by: @received_by,
        idempotency_key: "purchase_receipt:#{receipt.id}:#{row.fetch(:variant_id)}"
      )
    end

    # The status is a summary of the receipts, never a choice — and it is recomputed from the
    # ledger rather than inferred from this receipt, so a delivery that completes an order the
    # device knew nothing about still closes it out.
    def settle_status!(order)
      target = ReceiptLines.fully_received?(order) ? "received" : "partially_received"
      TransitionOrder.call(order: order, to: target, by_receipt: true)
    end

    def uuid?(value)
      Inventory::RecordMovement::UUID_FORMAT.match?(value.to_s)
    end
  end
end
