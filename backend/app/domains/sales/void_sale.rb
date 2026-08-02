module Sales
  # Voiding a completed sale: the sale is marked `voided` and every line it took out of stock is
  # put back with a compensating movement. BR-POS-05.
  #
  # Nothing is deleted and no movement is edited. The ledger is append-only, so undoing a sale
  # means writing the opposite of it — the original `sale` movements stay exactly where they are,
  # and the pair tells the true story: goods went out at 14:02 and came back at 14:04.
  #
  # The compensating movements are typed `adjustment` rather than `return`. A return is a
  # customer bringing goods back, with its own records and its own refund; a void is the till
  # correcting itself. They point at the sale through `reference_type`/`reference_id`, which is
  # what makes them readable in the movement log.
  #
  # NOTE for reporting (Sprint J): a voided sale still has its original `sale` movements, so
  # takings must be summed from the `sales` table filtered on status, never from movements alone.
  class VoidSale
    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(org_id:, sale_id:, voided_by: nil, reason: nil)
      @org_id = org_id
      @sale_id = sale_id.presence
      @voided_by = voided_by.presence
      @reason = reason.presence
    end

    def call
      sale = load_sale!

      # Already voided: the caller asked for a state the sale is in, and it is. This is what makes
      # a replayed void — or two tills voiding the same sale — safe.
      return sale if sale.status == "voided"

      ActiveRecord::Base.transaction(requires_new: true) do
        sale.sale_items.each { |line| put_back!(sale, line) }
        sale.update!(status: "voided")
        sale
      end
    end

    private

    def load_sale!
      raise ArgumentError, "Missing field: id" if @sale_id.blank?
      raise ArgumentError, "Invalid sale" unless Inventory::RecordMovement::UUID_FORMAT.match?(@sale_id.to_s)

      sale = Sale.find_by(org_id: @org_id, id: @sale_id)
      raise ArgumentError, "Invalid sale" if sale.blank?
      # `voided` is handled by the caller as a replay; anything else is not a sale to undo.
      raise ArgumentError, "Cannot void a sale that is #{sale.status}" unless sale.voidable? || sale.status == "voided"

      sale
    end

    def put_back!(sale, line)
      Inventory::RecordMovement.call(
        org_id: @org_id,
        variant_id: line.variant_id,
        location_id: sale.location_id,
        type: "adjustment",
        # The exact opposite of what the sale took out.
        quantity_delta: line.quantity,
        reference_type: "Sale",
        reference_id: sale.id,
        created_by: @voided_by,
        note: @reason.presence || "Sale voided",
        # Keyed off the sale line, so a void that arrives twice puts the stock back once.
        idempotency_key: "sale_void:#{sale.id}:#{line.id}"
      )
    end
  end
end
