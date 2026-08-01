module Sales
  # How a sale was paid for. Small, but it carries the one invariant that decides whether the
  # till's drawer agrees with the books: **the payments must add up to the total** (FR-POS-03).
  class SalePayments
    # The `payments.method` column is free text, so a typo would otherwise become a payment
    # method and quietly split the day's takings across "cash" and "csah".
    METHODS = %w[cash card mobile_money voucher].freeze

    def self.normalize(payments, total:)
      rows = Array(payments).map { |payment| normalize_one(payment) }
      raise ArgumentError, "A sale needs at least one payment" if rows.empty?

      paid = rows.sum(0.to_d) { |row| row.fetch(:amount) }.round(2)
      unless paid == total
        # Split payments are normal; a mismatch is not. Refusing here is what stops a sale being
        # recorded as paid when it was not — the server is authoritative for the total, so the
        # till has to agree with the total the server derived, not the one it hoped for.
        # Money reads with its cents — "10.0 due" looks like a bug to whoever is holding the till.
        raise ArgumentError,
              format("Payments must add up to the sale total: %.2f due, %.2f paid", total, paid)
      end

      rows
    end

    def self.payload(sale)
      sale.payments.order(:id).map do |payment|
        {
          id: payment.id,
          sale_id: payment.sale_id,
          method: payment.method,
          # decimals as strings so the client's JSON parse cannot round them
          amount: payment.amount.to_s,
          reference: payment.reference,
          paid_at: payment.paid_at&.iso8601(6)
        }
      end
    end

    def self.normalize_one(payment)
      row = payment.is_a?(Hash) ? payment : payment.to_h
      method = fetch(row, :method).to_s.strip.downcase
      raise ArgumentError, "Missing field: method" if method.blank?
      raise ArgumentError, "Invalid payment method: #{method}" unless METHODS.include?(method)

      amount = SaleLines.decimal(fetch(row, :amount), field: "amount")
      raise ArgumentError, "amount must be greater than zero" if amount.nil? || amount <= 0

      {
        id: fetch(row, :id).presence,
        method: method,
        amount: amount,
        reference: fetch(row, :reference).presence,
        paid_at: Iso8601Time.parse(fetch(row, :paid_at), field: "paid_at")
      }
    end

    def self.fetch(hash, key)
      hash[key.to_s] || hash[key]
    end

    private_class_method :normalize_one, :fetch
  end
end
