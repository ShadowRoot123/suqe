module Purchasing
  # Receipt-line handling, the counterpart to OrderLines: parse and validate what arrived
  # against what was ordered, then describe the result back to the client.
  #
  # A receipt line is only ever *matched* against an order line — there is no "receive
  # something nobody ordered". That is what makes "fully received" a question with an answer,
  # and it is why OrderLines refuses two lines for the same variant.
  class ReceiptLines
    # `ordered` is the order's lines by variant_id, `already_received` the quantities earlier
    # receipts have already booked in ({ variant_id => BigDecimal }).
    def self.normalize(items, ordered:, already_received:)
      rows = Array(items).map { |item| normalize_one(item, ordered: ordered) }

      # A receipt that books nothing in would still advance the order's status.
      raise ArgumentError, "A purchase receipt needs at least one line" if rows.empty?

      variant_ids = rows.map { |row| row.fetch(:variant_id) }
      duplicate = variant_ids.tally.find { |_, count| count > 1 }&.first
      raise ArgumentError, "Duplicate line for variant #{duplicate}" if duplicate

      rows.each { |row| check_outstanding!(row, ordered: ordered, already_received: already_received) }

      rows
    end

    # What every earlier receipt against this order has booked in, by variant.
    def self.received_by_variant(order)
      PurchaseReceiptItem
        .joins("INNER JOIN purchase_receipts ON purchase_receipts.id = purchase_receipt_items.receipt_id")
        .where(purchase_receipts: { purchase_order_id: order.id })
        .group("purchase_receipt_items.variant_id")
        .sum(:quantity_received)
    end

    # True once every ordered line has been received in full. Deliberately a `>=` per line and
    # not a comparison of totals: 10 of one variant and none of another is not "10 received".
    def self.fully_received?(order)
      ordered = PurchaseItem.where(purchase_order_id: order.id).group(:variant_id).sum(:quantity_ordered)
      return false if ordered.empty?

      received = received_by_variant(order)
      ordered.all? { |variant_id, quantity| received.fetch(variant_id, 0.to_d) >= quantity }
    end

    def self.payload(receipt)
      location_id = receipt.purchase_order.location_id
      # One query for the whole receipt; the index on (org_id, reference_type, reference_id)
      # serves it.
      movements = InventoryMovement
        .where(org_id: receipt.org_id, reference_type: "PurchaseReceipt", reference_id: receipt.id)
        .index_by(&:variant_id)

      receipt.purchase_receipt_items.order(:variant_id).map do |line|
        {
          id: line.id,
          receipt_id: line.receipt_id,
          variant_id: line.variant_id,
          # decimals as strings so the client's JSON parse cannot round them
          quantity_received: line.quantity_received.to_s,
          unit_cost: line.unit_cost.to_s,
          movement_id: movements[line.variant_id]&.id,
          # so the pull feed can refresh on-hand without a second round trip, the way an
          # adjustment's change record does
          on_hand: Inventory::OnHand.for(
            org_id: receipt.org_id, variant_id: line.variant_id, location_id: location_id
          ).to_s
        }
      end
    end

    def self.normalize_one(item, ordered:)
      row = item.is_a?(Hash) ? item : item.to_h
      variant_id = fetch(row, :variant_id).presence
      raise ArgumentError, "Missing field: variant_id" if variant_id.blank?

      line = ordered[variant_id]
      raise ArgumentError, "Variant #{variant_id} is not on this purchase order" if line.blank?

      quantity = decimal(fetch(row, :quantity_received), field: "quantity_received")
      raise ArgumentError, "quantity_received must be greater than zero" if quantity.nil? || quantity <= 0

      # A line that does not name a cost was received at the price it was ordered at, which is
      # the common case; naming one records what the delivery actually cost (SRS FR-PO-02).
      raw_cost = fetch(row, :unit_cost)
      cost = raw_cost.nil? || raw_cost.to_s.strip.empty? ? line.unit_cost : decimal(raw_cost, field: "unit_cost")
      raise ArgumentError, "unit_cost must not be negative" if cost.negative?

      { id: fetch(row, :id).presence, variant_id: variant_id, quantity_received: quantity, unit_cost: cost }
    end

    def self.check_outstanding!(row, ordered:, already_received:)
      variant_id = row.fetch(:variant_id)
      outstanding = ordered.fetch(variant_id).quantity_ordered - already_received.fetch(variant_id, 0.to_d)
      return if row.fetch(:quantity_received) <= outstanding

      # An over-delivery is a conversation with the supplier, not a silent inventory increment:
      # the order's lines are the agreement receiving is measured against, and letting a receipt
      # exceed them would make "fully received" mean nothing. Adjust the stock separately.
      raise ArgumentError,
            "Cannot receive more than ordered for variant #{variant_id}: #{outstanding.to_s('F')} outstanding"
    end

    # Quantities and costs arrive as strings from the client's SQLite; a bad one has to fail the
    # command with a readable message rather than reach the numeric column as a StatementInvalid.
    def self.decimal(value, field:)
      return nil if value.nil? || value.to_s.strip.empty?

      BigDecimal(value.to_s.strip)
    rescue ArgumentError, TypeError
      raise ArgumentError, "#{field} must be a number"
    end

    def self.fetch(hash, key)
      hash[key.to_s] || hash[key]
    end

    private_class_method :normalize_one, :check_outstanding!, :decimal, :fetch
  end
end
