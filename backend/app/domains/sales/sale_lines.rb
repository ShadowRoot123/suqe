module Sales
  # Line handling for a sale: parse and validate what the till sent, derive the totals from it,
  # and describe the result back to the client. The counterpart to Purchasing::OrderLines.
  #
  # Unlike a purchase order, **two lines for the same variant are allowed** — a cart can hold the
  # same item at two different discounts, and nothing is ever matched against these lines the way
  # a receipt is matched against an order. That is why a movement is keyed by the line rather
  # than by the variant.
  class SaleLines
    def self.normalize(items, org_id:)
      rows = Array(items).map { |item| normalize_one(item, org_id: org_id) }
      # A sale of nothing is not a sale, and it would still take a payment.
      raise ArgumentError, "A sale needs at least one line" if rows.empty?

      variant_ids = rows.map { |row| row.fetch(:variant_id) }.uniq
      known = Variant.where(org_id: org_id, id: variant_ids).pluck(:id)
      raise ArgumentError, "Invalid variant" if (variant_ids - known).any?

      # FR-CAT-01: archiving is how an item is taken off sale, so the guard has to live where the
      # selling happens. Until now it was only enforced in the client's search.
      archived = Variant.where(org_id: org_id, id: variant_ids)
        .joins("INNER JOIN products ON products.id = variants.product_id")
        .where(products: { status: "archived" })
        .pluck(:id)
      raise ArgumentError, "Variant #{archived.first} is archived and cannot be sold" if archived.any?

      rows
    end

    # Totals are always derived from the lines, never taken from the caller — the same rule as a
    # purchase order's total, and the reason a till cannot talk the server into a cheaper sale.
    #
    # Each sum is rounded once at the end rather than per line. Rounding per line drifts a cent
    # or two from the client, and the difference would show up as the total changing under the
    # cashier the moment the sale synced. The cart mirrors this rule (Day 2); the purchase-order
    # total is the same arithmetic, asserted on both sides by `orderTotals.test.ts`.
    def self.totals_for(rows)
      subtotal = rows.sum(0.to_d) { |row| row.fetch(:quantity) * row.fetch(:unit_price) }.round(2)
      discount = rows.sum(0.to_d) { |row| row.fetch(:discount) }.round(2)
      tax = rows.sum(0.to_d) { |row| row.fetch(:tax) }.round(2)

      { subtotal: subtotal, discount: discount, tax: tax, total_amount: (subtotal + tax - discount).round(2) }
    end

    def self.payload(sale)
      sale.sale_items.order(:id).map do |line|
        {
          id: line.id,
          sale_id: line.sale_id,
          variant_id: line.variant_id,
          # decimals as strings so the client's JSON parse cannot round them
          quantity: line.quantity.to_s,
          unit_price: line.unit_price.to_s,
          discount: line.discount.to_s,
          tax: line.tax.to_s
        }
      end
    end

    def self.normalize_one(item, org_id:)
      row = item.is_a?(Hash) ? item : item.to_h
      variant_id = fetch(row, :variant_id).presence
      raise ArgumentError, "Missing field: variant_id" if variant_id.blank?
      raise ArgumentError, "Invalid variant" unless Inventory::RecordMovement::UUID_FORMAT.match?(variant_id.to_s)

      quantity = decimal(fetch(row, :quantity), field: "quantity")
      raise ArgumentError, "quantity must be greater than zero" if quantity.nil? || quantity <= 0

      unit_price = decimal(fetch(row, :unit_price), field: "unit_price")
      # A giveaway is a real line; a negative price is a refund pretending to be a sale.
      raise ArgumentError, "unit_price must not be negative" if unit_price.nil? || unit_price.negative?

      discount = decimal(fetch(row, :discount), field: "discount") || 0.to_d
      tax = decimal(fetch(row, :tax), field: "tax") || 0.to_d
      raise ArgumentError, "discount must not be negative" if discount.negative?
      raise ArgumentError, "tax must not be negative" if tax.negative?
      # Otherwise the line is worth less than nothing and the sale total starts paying the customer.
      if discount > (quantity * unit_price).round(2)
        raise ArgumentError, "discount must not be greater than the line total"
      end

      {
        id: fetch(row, :id).presence,
        variant_id: variant_id,
        quantity: quantity,
        unit_price: unit_price,
        discount: discount,
        tax: tax
      }
    end

    # Amounts arrive as strings from the client's SQLite; a bad one has to fail the command with a
    # readable message rather than reach the numeric column as a StatementInvalid. Public because
    # SalePayments parses amounts by the same rules.
    def self.decimal(value, field:)
      return nil if value.nil? || value.to_s.strip.empty?

      BigDecimal(value.to_s.strip)
    rescue ArgumentError, TypeError
      raise ArgumentError, "#{field} must be a number"
    end

    def self.fetch(hash, key)
      hash[key.to_s] || hash[key]
    end

    private_class_method :normalize_one, :fetch
  end
end
