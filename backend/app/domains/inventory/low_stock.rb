module Inventory
  # Resolves reorder points against the ledger. A threshold naming a location wins over the
  # variant-wide default (location_id IS NULL); a variant with neither is never low, because an
  # unset threshold is not the same as a threshold of zero.
  class LowStock
    Row = Struct.new(:variant_id, :location_id, :on_hand, :reorder_point, :reorder_quantity, keyword_init: true) do
      def shortfall
        reorder_point - on_hand
      end
    end

    # The threshold that actually applies at this location, or nil when none is configured.
    def self.effective(org_id:, variant_id:, location_id: nil)
      scope = StockThreshold.where(org_id: org_id, variant_id: variant_id)
      (location_id.present? ? scope.find_by(location_id: location_id) : nil) || scope.find_by(location_id: nil)
    end

    # Every (variant, location) pair sitting at or below its effective reorder point.
    def self.rows(org_id:, location_id: nil)
      thresholds = StockThreshold.where(org_id: org_id)
      thresholds = thresholds.where(location_id: [location_id, nil]) if location_id.present?
      thresholds = thresholds.to_a
      return [] if thresholds.empty?

      defaults = {}
      per_location = {}
      thresholds.each do |threshold|
        if threshold.location_id.nil?
          defaults[threshold.variant_id] = threshold
        else
          per_location[[threshold.variant_id, threshold.location_id]] = threshold
        end
      end

      on_hand = OnHand.by_variant_and_location(
        org_id: org_id,
        variant_ids: thresholds.map(&:variant_id).uniq,
        location_id: location_id
      )

      # A threshold that names a location is a claim that the variant belongs there, so it is
      # reported at 0 even with no ledger history. A variant-wide default cannot be: it would
      # otherwise cross every variant with every location the org has ever opened.
      per_location.each_key { |key| on_hand[key] ||= 0.to_d }

      rows = on_hand.filter_map do |(variant_id, loc_id), quantity|
        threshold = per_location[[variant_id, loc_id]] || defaults[variant_id]
        next if threshold.nil?
        next if quantity > threshold.reorder_point

        Row.new(
          variant_id: variant_id,
          location_id: loc_id,
          on_hand: quantity,
          reorder_point: threshold.reorder_point,
          reorder_quantity: threshold.reorder_quantity
        )
      end

      rows.sort_by { |row| [-row.shortfall, row.variant_id, row.location_id] }
    end
  end
end
