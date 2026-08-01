module Sales
  # Finalising a sale: the sale, its lines, its payments and one negative `sale` movement per
  # line — all in one transaction, or none of it. The only way a sale enters the system, so the
  # REST controller and the `sale` sync command cannot drift apart.
  #
  # Replay-safe twice over, like ReceiveOrder: the sale is looked up by its client id and by the
  # command's idempotency key before anything is written, and every movement carries a key
  # derived from the sale id, so a till that sends the same sale twice decrements stock once.
  # This is the command the whole offline story is for — a sale that reaches the server twice
  # after a flaky push must not sell the same goods twice.
  class CreateSale
    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(org_id:, location_id:, items:, payments:, id: nil, sold_at: nil,
                   cashier_id: nil, idempotency_key: nil)
      @org_id = org_id
      @id = id.presence
      @location_id = location_id.presence
      @items = items
      @payments = payments
      @sold_at = sold_at
      @cashier_id = cashier_id.presence
      @idempotency_key = idempotency_key.presence
    end

    def call
      existing = find_existing
      return existing if existing

      validate_location!
      sold_at = Iso8601Time.parse(@sold_at, field: "sold_at")

      rows = SaleLines.normalize(@items, org_id: @org_id)
      totals = SaleLines.totals_for(rows)
      payments = SalePayments.normalize(@payments, total: totals.fetch(:total_amount))

      begin
        ActiveRecord::Base.transaction(requires_new: true) do
          sale = Sale.create!(
            {
              id: @id,
              org_id: @org_id,
              location_id: @location_id,
              cashier_id: @cashier_id,
              status: "completed",
              sold_at: sold_at,
              idempotency_key: @idempotency_key
            }.compact.merge(totals)
          )

          rows.each { |row| write_line!(sale, row) }
          payments.each { |payment| write_payment!(sale, payment) }

          sale
        end
      rescue ActiveRecord::RecordNotUnique
        # A concurrent replay: the winner already decremented the stock. Reachable only from
        # inside the savepoint above, which is what lets this lookup run at all.
        duplicate = find_existing
        raise if duplicate.blank?

        duplicate
      end
    end

    private

    # Either the till is replaying a sale it already got an ack for (same sale id), or the same
    # command arrived under a second outbox row (same idempotency key).
    def find_existing
      by_id = @id.present? ? Sale.find_by(org_id: @org_id, id: @id) : nil
      return by_id if by_id.present?
      return nil if @idempotency_key.blank?

      Sale.find_by(org_id: @org_id, idempotency_key: @idempotency_key)
    end

    def validate_location!
      raise ArgumentError, "Missing field: location_id" if @location_id.blank?
      raise ArgumentError, "Invalid location" unless Inventory::RecordMovement::UUID_FORMAT.match?(@location_id.to_s)
      raise ArgumentError, "Invalid location" unless Location.where(org_id: @org_id, id: @location_id).exists?
    end

    def write_line!(sale, row)
      line = SaleItem.create!(
        {
          id: row[:id],
          sale_id: sale.id,
          variant_id: row.fetch(:variant_id),
          quantity: row.fetch(:quantity),
          unit_price: row.fetch(:unit_price),
          discount: row.fetch(:discount),
          tax: row.fetch(:tax)
        }.compact
      )

      # Keyed by the *line*, not the variant: a cart may hold the same item twice, and two lines
      # sharing one key would silently collapse into a single decrement.
      #
      # Deliberately no stock check. An offline sale has already happened in the shop by the time
      # it reaches here, so refusing it for insufficient stock would throw away a real transaction
      # and leave the books disagreeing with the till. Negative on-hand is a signal to investigate,
      # not a reason to reject history. See HANDOFF.md — BR-INV-03's configurable policy is unbuilt.
      Inventory::RecordMovement.call(
        org_id: @org_id,
        variant_id: row.fetch(:variant_id),
        location_id: sale.location_id,
        type: "sale",
        quantity_delta: -row.fetch(:quantity),
        reference_type: "Sale",
        reference_id: sale.id,
        created_by: @cashier_id,
        idempotency_key: "sale:#{sale.id}:#{line.id}"
      )
    end

    def write_payment!(sale, payment)
      Payment.create!(
        {
          id: payment[:id],
          sale_id: sale.id,
          method: payment.fetch(:method),
          amount: payment.fetch(:amount),
          reference: payment[:reference],
          paid_at: payment[:paid_at]
        }.compact
      )
    end
  end
end
