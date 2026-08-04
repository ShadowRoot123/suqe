module Purchasing
  # Line-item handling shared by CreateOrder and UpdateOrder: parse and validate what the
  # client sent, then make the order's lines match it exactly.
  #
  # The client owns line ids the way it owns every other id in this app, so a line is matched
  # by id rather than by position — an edit that reorders or removes a row keeps the surviving
  # rows' ids stable, and replaying the command converges on the same set instead of churning.
  class OrderLines
    def self.normalize(items, org_id:)
      rows = Array(items).map { |item| normalize_one(item, org_id: org_id) }

      variant_ids = rows.map { |row| row.fetch(:variant_id) }
      duplicate = variant_ids.tally.find { |_, count| count > 1 }&.first
      # One line per variant. Two lines for the same variant would make "ordered 5" ambiguous
      # against a receipt, and no unique index enforces it (the client's store has none either).
      raise ArgumentError, "Duplicate line for variant #{duplicate}" if duplicate

      missing = variant_ids - Variant.where(org_id: org_id, id: variant_ids).pluck(:id)
      raise ArgumentError, "Invalid variant" if missing.any?

      rows
    end

    # Makes `order`'s lines exactly `rows`, and returns the order total the lines add up to.
    def self.replace!(order, rows)
      existing = order.purchase_items.index_by(&:id)
      kept = []

      rows.each do |row|
        line = row[:id].present? ? existing[row[:id]] : nil
        attrs = row.slice(:variant_id, :quantity_ordered, :unit_cost)

        if line
          line.update!(attrs)
        else
          line = PurchaseItem.create!(attrs.merge({ id: row[:id], purchase_order_id: order.id }.compact))
        end
        kept << line.id
      end

      (existing.keys - kept).each { |id| existing.fetch(id).destroy! }
      order.purchase_items.reset

      total_for(rows)
    end

    def self.total_for(rows)
      rows.sum(0.to_d) { |row| row.fetch(:quantity_ordered) * row.fetch(:unit_cost) }.round(ColumnScale::MONEY)
    end

    def self.payload(order)
      order.purchase_items.order(:created_at).map do |line|
        {
          id: line.id,
          purchase_order_id: line.purchase_order_id,
          variant_id: line.variant_id,
          # decimals as strings so the client's JSON parse cannot round them
          quantity_ordered: line.quantity_ordered.to_s,
          unit_cost: line.unit_cost.to_s
        }
      end
    end

    def self.normalize_one(item, org_id:)
      row = item.is_a?(Hash) ? item : item.to_h
      variant_id = fetch(row, :variant_id).presence
      raise ArgumentError, "Missing field: variant_id" if variant_id.blank?
      raise ArgumentError, "Invalid variant" unless Inventory::RecordMovement::UUID_FORMAT.match?(variant_id.to_s)

      quantity = decimal(fetch(row, :quantity_ordered), field: "quantity_ordered")
      cost = decimal(fetch(row, :unit_cost), field: "unit_cost")
      raise ArgumentError, "quantity_ordered must be greater than zero" if quantity.nil? || quantity <= 0
      # Free goods are a real line; a negative cost is not.
      raise ArgumentError, "unit_cost must not be negative" if cost.nil? || cost.negative?

      # Round to what the columns hold before `total_for` derives anything from these, and after
      # the checks above so a cost of -0.004 stays refused. Summing the unrounded values left an
      # order's `total_cost` a cent away from the sum of its own stored lines — the same defect
      # `SaleLines` had, where it also got sales refused. See `ColumnScale`.
      quantity = ColumnScale.quantity(quantity)
      cost = ColumnScale.money(cost)
      # Only reachable from below half a thousandth, which is not a quantity anyone ordered.
      raise ArgumentError, "quantity_ordered must be greater than zero" if quantity <= 0

      { id: fetch(row, :id).presence, variant_id: variant_id, quantity_ordered: quantity, unit_cost: cost }
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

    private_class_method :normalize_one, :decimal, :fetch
  end
end
