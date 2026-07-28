module Inventory
  # The only way a row enters the inventory ledger. Writes an immutable movement and
  # updates the snapshot cache in one transaction; replaying the same idempotency_key
  # returns the original movement without moving stock again.
  class RecordMovement
    TYPES = %w[purchase sale return adjustment transfer_out transfer_in].freeze
    UUID_FORMAT = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

    def self.call(**kwargs)
      new(**kwargs).call
    end

    def initialize(org_id:, variant_id:, location_id:, quantity_delta:, id: nil, type: "adjustment",
                   note: nil, reference_type: nil, reference_id: nil, created_by: nil, idempotency_key: nil)
      @org_id = org_id
      @id = id.presence
      @variant_id = variant_id
      @location_id = location_id
      @quantity_delta = quantity_delta
      @type = type.presence&.to_s
      @note = note.presence
      @reference_type = reference_type.presence
      @reference_id = reference_id.presence
      @created_by = created_by.presence
      @idempotency_key = idempotency_key.presence
    end

    def call
      delta = validate!

      existing = find_existing
      return existing if existing

      movement = nil
      begin
        ActiveRecord::Base.transaction(requires_new: true) do
          movement = InventoryMovement.create!(
            {
              id: @id,
              org_id: @org_id,
              variant_id: @variant_id,
              location_id: @location_id,
              type: @type,
              quantity_delta: delta,
              reference_type: @reference_type,
              reference_id: @reference_id,
              note: @note,
              created_by: @created_by,
              idempotency_key: @idempotency_key
            }.compact
          )

          UpdateSnapshot.call(
            org_id: @org_id,
            variant_id: @variant_id,
            location_id: @location_id,
            quantity_delta: delta
          )
        end
      rescue ActiveRecord::RecordNotUnique
        # Concurrent replay of the same command: the winner already moved the stock.
        duplicate = find_existing
        raise if duplicate.blank?

        return duplicate
      end

      movement
    end

    private

    def validate!
      raise ArgumentError, "Missing field: variant_id" if @variant_id.blank?
      raise ArgumentError, "Missing field: location_id" if @location_id.blank?
      raise ArgumentError, "Missing field: quantity_delta" if @quantity_delta.blank?
      raise ArgumentError, "Invalid movement type: #{@type}" unless TYPES.include?(@type)
      raise ArgumentError, "Invalid variant" unless uuid?(@variant_id)
      raise ArgumentError, "Invalid location" unless uuid?(@location_id)

      delta = parse_decimal(@quantity_delta)
      raise ArgumentError, "quantity_delta must be a number" if delta.nil?
      raise ArgumentError, "quantity_delta must not be zero" if delta.zero?

      raise ArgumentError, "Invalid variant" unless Variant.where(org_id: @org_id, id: @variant_id).exists?
      raise ArgumentError, "Invalid location" unless Location.where(org_id: @org_id, id: @location_id).exists?

      delta
    end

    def find_existing
      return nil if @idempotency_key.blank?

      InventoryMovement.find_by(org_id: @org_id, idempotency_key: @idempotency_key)
    end

    def parse_decimal(value)
      return value if value.is_a?(BigDecimal)
      return BigDecimal(value.to_s) if value.is_a?(Numeric)

      BigDecimal(value.to_s.strip)
    rescue ArgumentError, TypeError
      nil
    end

    def uuid?(value)
      UUID_FORMAT.match?(value.to_s)
    end
  end
end
