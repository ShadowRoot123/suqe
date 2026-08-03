module OfflineSync
  class ProcessPending
    SUPPORTED_OPERATIONS = %w[create update delete].freeze
    # Mirrors the location_type pg enum; a bad value would otherwise surface as a raw
    # StatementInvalid and poison the surrounding transaction.
    LOCATION_TYPES = %w[shop warehouse].freeze

    def self.call(org_id:, limit: 100)
      new(org_id:, limit:).call
    end

    def initialize(org_id:, limit:)
      @org_id = org_id
      @limit = limit
    end

    def call
      processed = []

      SyncOutbox.transaction do
        items = SyncOutbox
          .where(org_id: @org_id, status: "pending")
          .order(:created_at)
          .limit(@limit)
          .lock("FOR UPDATE SKIP LOCKED")

        items.each do |item|
          item.update!(status: "processing")
          begin
            SyncOutbox.transaction(requires_new: true) do
              result = process_one(item)
              item.update!(status: result.fetch(:status))
              write_audit_log(item, result)
            end
          rescue ActiveRecord::StatementInvalid, ActiveRecord::RecordInvalid => e
            failure = { status: "failed", entity_id: nil, record: normalize_hash(item.payload), error: e.message }
            SyncOutbox.transaction(requires_new: true) do
              item.update!(status: "failed")
              write_audit_log(item, failure)
            end
          end
          processed << item.id
        end
      end

      { processed_ids: processed }
    end

    private

    def process_one(item)
      unless SUPPORTED_OPERATIONS.include?(item.operation)
        return { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
      end

      if item.entity == "category"
        return apply_category(item)
      end

      if item.entity == "product"
        return apply_product(item)
      end

      if item.entity == "variant"
        return apply_variant(item)
      end

      if item.entity == "product_group"
        return apply_product_group(item)
      end

      if item.entity == "product_group_membership"
        return apply_product_group_membership(item)
      end

      if item.entity == "inventory_adjustment"
        return apply_inventory_adjustment(item)
      end

      if item.entity == "location"
        return apply_location(item)
      end

      if item.entity == "stock_threshold"
        return apply_stock_threshold(item)
      end

      if item.entity == "supplier"
        return apply_supplier(item)
      end

      if item.entity == "purchase_order"
        return apply_purchase_order(item)
      end

      if item.entity == "purchase_receipt"
        return apply_purchase_receipt(item)
      end

      if item.entity == "sale"
        return apply_sale(item)
      end

      { status: "applied", entity_id: nil, record: nil, error: nil }
    rescue StandardError => e
      { status: "failed", entity_id: nil, record: nil, error: e.message }
    end

    def apply_category(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        name = fetch_key(payload, :name).to_s.strip
        parent_id = fetch_key(payload, :parent_id).presence
        requested_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: name" if name.blank?

        category =
          begin
            with_savepoint { Category.create!(id: requested_id, org_id: org_id, name: name, parent_id: parent_id) }
          rescue ActiveRecord::RecordNotUnique
            Category.find_by!(org_id: org_id, name: name)
          end

        return {
          status: "applied",
          entity_id: category.id,
          record: { id: category.id, name: category.name, parent_id: category.parent_id },
          error: nil
        }
      when "update"
        category_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if category_id.blank?

        category = Category.find_by(org_id: org_id, id: category_id)
        return { status: "applied", entity_id: category_id, record: { id: category_id }, error: nil } if category.blank?

        updates = {}
        updates[:name] = fetch_key(payload, :name).to_s.strip if payload.key?("name") || payload.key?(:name)
        updates[:parent_id] = fetch_key(payload, :parent_id) if payload.key?("parent_id") || payload.key?(:parent_id)
        category.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: category.id,
          record: { id: category.id, name: category.name, parent_id: category.parent_id },
          error: nil
        }
      when "delete"
        category_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if category_id.blank?

        category = Category.find_by(org_id: org_id, id: category_id)
        category&.destroy!

        return { status: "applied", entity_id: category_id, record: { id: category_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def apply_product(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        name = fetch_key(payload, :name).to_s.strip
        requested_id = fetch_key(payload, :id).presence
        category_id = fetch_key(payload, :category_id).presence
        status = fetch_key(payload, :status).presence
        raise ArgumentError, "Missing field: name" if name.blank?

        product =
          begin
            attrs = { id: requested_id, org_id: org_id, name: name, category_id: category_id, status: status }.compact
            with_savepoint { Product.create!(attrs) }
          rescue ActiveRecord::RecordNotUnique
            Product.find_by!(org_id: org_id, name: name)
          end

        return {
          status: "applied",
          entity_id: product.id,
          record: { id: product.id, name: product.name, category_id: product.category_id, status: product.status },
          error: nil
        }
      when "update"
        product_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if product_id.blank?

        product = Product.find_by(org_id: org_id, id: product_id)
        return { status: "applied", entity_id: product_id, record: { id: product_id }, error: nil } if product.blank?

        updates = {}
        updates[:name] = fetch_key(payload, :name).to_s.strip if payload.key?("name") || payload.key?(:name)
        updates[:category_id] = fetch_key(payload, :category_id) if payload.key?("category_id") || payload.key?(:category_id)
        updates[:status] = fetch_key(payload, :status) if payload.key?("status") || payload.key?(:status)
        product.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: product.id,
          record: { id: product.id, name: product.name, category_id: product.category_id, status: product.status },
          error: nil
        }
      when "delete"
        product_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if product_id.blank?

        product = Product.find_by(org_id: org_id, id: product_id)
        product&.destroy!

        return { status: "applied", entity_id: product_id, record: { id: product_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def apply_variant(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        product_id = fetch_key(payload, :product_id).presence
        sku = fetch_key(payload, :sku).to_s.strip
        barcode = fetch_key(payload, :barcode).presence
        requested_id = fetch_key(payload, :id).presence
        variant_attrs = fetch_key(payload, :attrs) || fetch_key(payload, :attributes)
        price = fetch_key(payload, :price)
        cost_price = fetch_key(payload, :cost_price)

        raise ArgumentError, "Missing field: product_id" if product_id.blank?
        raise ArgumentError, "Missing field: sku" if sku.blank?

        variant =
          begin
            create_attrs = {
              id: requested_id,
              org_id: org_id,
              product_id: product_id,
              sku: sku,
              barcode: barcode,
              price: price,
              cost_price: cost_price
            }.compact
            with_savepoint { Variant.create!(create_attrs.merge({ attrs: (variant_attrs.presence || {}) })) }
          rescue ActiveRecord::RecordNotUnique
            Variant.find_by!(org_id: org_id, sku: sku)
          end

        return {
          status: "applied",
          entity_id: variant.id,
          record: {
            id: variant.id,
            product_id: variant.product_id,
            sku: variant.sku,
            barcode: variant.barcode,
            attrs: variant.attrs,
            price: variant.price,
            cost_price: variant.cost_price
          },
          error: nil
        }
      when "update"
        variant_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if variant_id.blank?

        variant = Variant.find_by(org_id: org_id, id: variant_id)
        return { status: "applied", entity_id: variant_id, record: { id: variant_id }, error: nil } if variant.blank?

        updates = {}
        updates[:product_id] = fetch_key(payload, :product_id) if payload.key?("product_id") || payload.key?(:product_id)
        updates[:sku] = fetch_key(payload, :sku).to_s.strip if payload.key?("sku") || payload.key?(:sku)
        updates[:barcode] = fetch_key(payload, :barcode) if payload.key?("barcode") || payload.key?(:barcode)
        updates[:price] = fetch_key(payload, :price) if payload.key?("price") || payload.key?(:price)
        updates[:cost_price] = fetch_key(payload, :cost_price) if payload.key?("cost_price") || payload.key?(:cost_price)
        updates[:attrs] = fetch_key(payload, :attrs) if payload.key?("attrs") || payload.key?(:attrs)
        updates[:attrs] = fetch_key(payload, :attributes) if updates[:attrs].blank? && (payload.key?("attributes") || payload.key?(:attributes))
        variant.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: variant.id,
          record: {
            id: variant.id,
            product_id: variant.product_id,
            sku: variant.sku,
            barcode: variant.barcode,
            attrs: variant.attrs,
            price: variant.price,
            cost_price: variant.cost_price
          },
          error: nil
        }
      when "delete"
        variant_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if variant_id.blank?

        variant = Variant.find_by(org_id: org_id, id: variant_id)
        variant&.destroy!

        return { status: "applied", entity_id: variant_id, record: { id: variant_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def apply_product_group(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        name = fetch_key(payload, :name).to_s.strip
        requested_id = fetch_key(payload, :id).presence
        variant_options = normalize_variant_options(fetch_key(payload, :variant_options))
        raise ArgumentError, "Missing field: name" if name.blank?

        group =
          begin
            with_savepoint { ProductGroup.create!(id: requested_id, org_id: org_id, name: name, variant_options: variant_options) }
          rescue ActiveRecord::RecordNotUnique
            ProductGroup.find_by!(org_id: org_id, name: name)
          end

        return {
          status: "applied",
          entity_id: group.id,
          record: { id: group.id, name: group.name, variant_options: group.variant_options },
          error: nil
        }
      when "update"
        group_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if group_id.blank?

        group = ProductGroup.find_by(org_id: org_id, id: group_id)
        return { status: "applied", entity_id: group_id, record: { id: group_id }, error: nil } if group.blank?

        updates = {}
        updates[:name] = fetch_key(payload, :name).to_s.strip if payload.key?("name") || payload.key?(:name)
        if payload.key?("variant_options") || payload.key?(:variant_options)
          updates[:variant_options] = normalize_variant_options(fetch_key(payload, :variant_options))
        end
        group.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: group.id,
          record: { id: group.id, name: group.name, variant_options: group.variant_options },
          error: nil
        }
      when "delete"
        group_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if group_id.blank?

        group = ProductGroup.find_by(org_id: org_id, id: group_id)
        group&.destroy!

        return { status: "applied", entity_id: group_id, record: { id: group_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def apply_product_group_membership(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        requested_id = fetch_key(payload, :id).presence
        product_group_id = fetch_key(payload, :product_group_id).presence
        product_id = fetch_key(payload, :product_id).presence
        raise ArgumentError, "Missing field: product_group_id" if product_group_id.blank?
        raise ArgumentError, "Missing field: product_id" if product_id.blank?

        raise ArgumentError, "Invalid product_group" unless ProductGroup.where(org_id: org_id, id: product_group_id).exists?
        raise ArgumentError, "Invalid product" unless Product.where(org_id: org_id, id: product_id).exists?

        membership =
          begin
            with_savepoint do
              ProductGroupMembership.create!(
                id: requested_id,
                org_id: org_id,
                product_group_id: product_group_id,
                product_id: product_id
              )
            end
          rescue ActiveRecord::RecordNotUnique
            ProductGroupMembership.find_by!(org_id: org_id, product_group_id: product_group_id, product_id: product_id)
          end

        return {
          status: "applied",
          entity_id: membership.id,
          record: { id: membership.id, product_group_id: membership.product_group_id, product_id: membership.product_id },
          error: nil
        }
      when "update"
        membership_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if membership_id.blank?

        membership = ProductGroupMembership.find_by(org_id: org_id, id: membership_id)
        return { status: "applied", entity_id: membership_id, record: { id: membership_id }, error: nil } if membership.blank?

        updates = {}
        updates[:product_group_id] = fetch_key(payload, :product_group_id) if payload.key?("product_group_id") || payload.key?(:product_group_id)
        updates[:product_id] = fetch_key(payload, :product_id) if payload.key?("product_id") || payload.key?(:product_id)
        if updates[:product_group_id].present? && !ProductGroup.where(org_id: org_id, id: updates[:product_group_id]).exists?
          raise ArgumentError, "Invalid product_group"
        end
        if updates[:product_id].present? && !Product.where(org_id: org_id, id: updates[:product_id]).exists?
          raise ArgumentError, "Invalid product"
        end
        membership.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: membership.id,
          record: { id: membership.id, product_group_id: membership.product_group_id, product_id: membership.product_id },
          error: nil
        }
      when "delete"
        membership_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if membership_id.blank?

        membership = ProductGroupMembership.find_by(org_id: org_id, id: membership_id)
        membership&.destroy!

        return { status: "applied", entity_id: membership_id, record: { id: membership_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def apply_location(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        name = fetch_key(payload, :name).to_s.strip
        requested_id = fetch_key(payload, :id).presence
        type = normalize_location_type(fetch_key(payload, :type))
        address = fetch_key(payload, :address).presence
        raise ArgumentError, "Missing field: name" if name.blank?

        location =
          begin
            with_savepoint { Location.create!(id: requested_id, org_id: org_id, name: name, type: type, address: address) }
          rescue ActiveRecord::RecordNotUnique
            # Either this exact command is being replayed (same id) or a second device already
            # named the same shop — both mean the org has the location that was asked for.
            (requested_id.present? ? Location.find_by(org_id: org_id, id: requested_id) : nil) ||
              Location.find_by!(org_id: org_id, name: name)
          end

        return {
          status: "applied",
          entity_id: location.id,
          record: { id: location.id, name: location.name, type: location.type, address: location.address },
          error: nil
        }
      when "update"
        location_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if location_id.blank?

        location = Location.find_by(org_id: org_id, id: location_id)
        return { status: "applied", entity_id: location_id, record: { id: location_id }, error: nil } if location.blank?

        updates = {}
        updates[:name] = fetch_key(payload, :name).to_s.strip if payload.key?("name") || payload.key?(:name)
        updates[:address] = fetch_key(payload, :address).presence if payload.key?("address") || payload.key?(:address)
        updates[:type] = normalize_location_type(fetch_key(payload, :type)) if payload.key?("type") || payload.key?(:type)
        raise ArgumentError, "Missing field: name" if updates.key?(:name) && updates[:name].blank?
        location.update!(updates) if updates.any?

        return {
          status: "applied",
          entity_id: location.id,
          record: { id: location.id, name: location.name, type: location.type, address: location.address },
          error: nil
        }
      when "delete"
        location_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if location_id.blank?

        location = Location.find_by(org_id: org_id, id: location_id)
        if location.present?
          begin
            # Every table that points at a location does so ON DELETE RESTRICT, so a location
            # stock has moved through cannot go. Take the savepoint: rescuing the foreign-key
            # violation without one would leave the outer transaction aborted.
            Location.transaction(requires_new: true) { location.destroy! }
          rescue ActiveRecord::StatementInvalid => e
            # ON DELETE RESTRICT raises restrict_violation (23001), which Rails does *not* map to
            # InvalidForeignKey (that is only 23503) — so match on the cause and let anything else
            # through rather than reporting an unrelated failure as history.
            raise unless e.cause.class.name.match?(/RestrictViolation|ForeignKeyViolation/)

            raise ArgumentError, "Location has stock history and cannot be deleted"
          end
        end

        return { status: "applied", entity_id: location_id, record: { id: location_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    # A unique-index collision is how a replay or a second device announces itself, and every
    # apply_* handler recovers by looking the existing row up. That recovery is only reachable
    # from inside a savepoint: the failed INSERT aborts the enclosing transaction, so without
    # one the lookup itself blows up with "current transaction is aborted".
    def with_savepoint
      ActiveRecord::Base.transaction(requires_new: true) { yield }
    end

    def normalize_location_type(value)
      type = value.to_s.strip.downcase
      return "shop" if type.blank?
      raise ArgumentError, "Invalid location type: #{type}" unless LOCATION_TYPES.include?(type)

      type
    end

    # The ledger is append-only: an adjustment can only ever be created, and replaying the
    # same command must not move stock twice (the outbox key is the movement's idempotency key).
    def apply_inventory_adjustment(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      unless item.operation == "create"
        return {
          status: "failed",
          entity_id: fetch_key(payload, :id),
          record: payload,
          error: "Inventory movements are immutable: #{item.operation} is not supported"
        }
      end

      variant_id = fetch_key(payload, :variant_id).presence
      location_id = fetch_key(payload, :location_id).presence

      movement = Inventory::RecordMovement.call(
        org_id: org_id,
        id: fetch_key(payload, :id).presence,
        variant_id: variant_id,
        location_id: location_id,
        quantity_delta: fetch_key(payload, :quantity_delta),
        note: fetch_key(payload, :note) || fetch_key(payload, :reason),
        created_by: actor_id(org_id, fetch_key(payload, :created_by)),
        idempotency_key: item.idempotency_key
      )

      {
        status: "applied",
        entity_id: movement.id,
        record: {
          id: movement.id,
          variant_id: movement.variant_id,
          location_id: movement.location_id,
          type: movement.type,
          quantity_delta: movement.quantity_delta.to_s,
          note: movement.note,
          created_by: movement.created_by,
          created_at: movement.created_at.iso8601(6),
          # so the pull feed can refresh on-hand without a second round trip
          on_hand: Inventory::OnHand.for(org_id: org_id, variant_id: variant_id, location_id: location_id).to_s
        },
        error: nil
      }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    # A reorder point is configuration, not ledger history, so unlike an adjustment it can be
    # changed and removed. A row without a location_id is the variant-wide default.
    def apply_stock_threshold(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        requested_id = fetch_key(payload, :id).presence
        variant_id = fetch_key(payload, :variant_id).presence
        location_id = fetch_key(payload, :location_id).presence
        reorder_point = parse_threshold_decimal(fetch_key(payload, :reorder_point), field: "reorder_point")
        reorder_quantity = parse_threshold_decimal(fetch_key(payload, :reorder_quantity), field: "reorder_quantity")

        raise ArgumentError, "Missing field: variant_id" if variant_id.blank?
        raise ArgumentError, "Missing field: reorder_point" if reorder_point.nil?
        raise ArgumentError, "Invalid variant" unless Variant.where(org_id: org_id, id: variant_id).exists?
        if location_id.present? && !Location.where(org_id: org_id, id: location_id).exists?
          raise ArgumentError, "Invalid location"
        end

        threshold =
          begin
            with_savepoint do
              StockThreshold.create!(
                { id: requested_id, org_id: org_id, variant_id: variant_id, location_id: location_id,
                  reorder_point: reorder_point, reorder_quantity: reorder_quantity }.compact
              )
            end
          rescue ActiveRecord::RecordNotUnique
            # Two devices set a reorder point for the same variant and location. Unlike a name
            # collision the key matches but the value may not, so the command that arrives later
            # wins instead of being silently dropped. A replay re-applies identical values.
            existing = StockThreshold.find_by!(org_id: org_id, variant_id: variant_id, location_id: location_id)
            existing.update!(reorder_point: reorder_point, reorder_quantity: reorder_quantity)
            existing
          end

        return { status: "applied", entity_id: threshold.id, record: threshold_record(threshold), error: nil }
      when "update"
        threshold_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if threshold_id.blank?

        threshold = StockThreshold.find_by(org_id: org_id, id: threshold_id)
        return { status: "applied", entity_id: threshold_id, record: { id: threshold_id }, error: nil } if threshold.blank?

        updates = {}
        if payload.key?("reorder_point") || payload.key?(:reorder_point)
          point = parse_threshold_decimal(fetch_key(payload, :reorder_point), field: "reorder_point")
          raise ArgumentError, "Missing field: reorder_point" if point.nil?

          updates[:reorder_point] = point
        end
        if payload.key?("reorder_quantity") || payload.key?(:reorder_quantity)
          updates[:reorder_quantity] = parse_threshold_decimal(fetch_key(payload, :reorder_quantity), field: "reorder_quantity")
        end
        threshold.update!(updates) if updates.any?

        return { status: "applied", entity_id: threshold.id, record: threshold_record(threshold), error: nil }
      when "delete"
        threshold_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if threshold_id.blank?

        threshold = StockThreshold.find_by(org_id: org_id, id: threshold_id)
        threshold&.destroy!

        return { status: "applied", entity_id: threshold_id, record: { id: threshold_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def threshold_record(threshold)
      {
        id: threshold.id,
        variant_id: threshold.variant_id,
        location_id: threshold.location_id,
        # decimals as strings so the client's JSON parse cannot round them
        reorder_point: threshold.reorder_point.to_s,
        reorder_quantity: threshold.reorder_quantity&.to_s
      }
    end

    # Quantities arrive as strings from the client's SQLite; a bad one has to fail the command
    # with a readable message rather than reach the numeric column as a StatementInvalid.
    def parse_threshold_decimal(value, field:)
      return nil if value.nil? || value.to_s.strip.empty?

      begin
        BigDecimal(value.to_s.strip)
      rescue ArgumentError, TypeError
        raise ArgumentError, "#{field} must be a number"
      end
    end

    # A supplier is plain reference data, so this is the same shape as apply_location: unique
    # name per org, and a delete that anything points at has to fail readably.
    def apply_supplier(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        name = fetch_key(payload, :name).to_s.strip
        requested_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: name" if name.blank?

        supplier =
          begin
            with_savepoint do
              Supplier.create!(
                { id: requested_id, org_id: org_id, name: name, phone: fetch_key(payload, :phone).presence,
                  email: fetch_key(payload, :email).presence, address: fetch_key(payload, :address).presence }.compact
              )
            end
          rescue ActiveRecord::RecordNotUnique
            # Either this exact command is being replayed (same id) or a second device already
            # added the same supplier — both mean the org has the supplier that was asked for.
            (requested_id.present? ? Supplier.find_by(org_id: org_id, id: requested_id) : nil) ||
              Supplier.find_by!(org_id: org_id, name: name)
          end

        return { status: "applied", entity_id: supplier.id, record: supplier_record(supplier), error: nil }
      when "update"
        supplier_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if supplier_id.blank?

        supplier = Supplier.find_by(org_id: org_id, id: supplier_id)
        return { status: "applied", entity_id: supplier_id, record: { id: supplier_id }, error: nil } if supplier.blank?

        updates = {}
        updates[:name] = fetch_key(payload, :name).to_s.strip if payload.key?("name") || payload.key?(:name)
        %i[phone email address].each do |field|
          next unless payload.key?(field.to_s) || payload.key?(field)

          updates[field] = fetch_key(payload, field).presence
        end
        raise ArgumentError, "Missing field: name" if updates.key?(:name) && updates[:name].blank?
        supplier.update!(updates) if updates.any?

        return { status: "applied", entity_id: supplier.id, record: supplier_record(supplier), error: nil }
      when "delete"
        supplier_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if supplier_id.blank?

        supplier = Supplier.find_by(org_id: org_id, id: supplier_id)
        if supplier.present?
          begin
            # purchase_orders.supplier_id is ON DELETE RESTRICT, so a supplier the org has ordered
            # from cannot go. Take the savepoint: rescuing the violation without one would leave
            # the outer transaction aborted.
            Supplier.transaction(requires_new: true) { supplier.destroy! }
          rescue ActiveRecord::StatementInvalid => e
            raise unless e.cause.class.name.match?(/RestrictViolation|ForeignKeyViolation/)

            raise ArgumentError, "Supplier has purchase orders and cannot be deleted"
          end
        end

        return { status: "applied", entity_id: supplier_id, record: { id: supplier_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    # A purchase order is a header plus its lines, and both travel in one command: the device
    # edits the order as a whole, and splitting it would let a line land without its header.
    # Status changes ride the same `update` operation — the pipeline only speaks create/update/
    # delete — but go through TransitionOrder so the lifecycle table still guards them.
    def apply_purchase_order(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      case item.operation
      when "create"
        order = Purchasing::CreateOrder.call(
          org_id: org_id,
          id: fetch_key(payload, :id).presence,
          supplier_id: fetch_key(payload, :supplier_id),
          location_id: fetch_key(payload, :location_id),
          expected_at: parse_time(fetch_key(payload, :expected_at), field: "expected_at"),
          items: fetch_key(payload, :items),
          created_by: actor_id(org_id, fetch_key(payload, :created_by))
        )

        # An order is always born a draft, but the device mirrors its own row and will send the
        # status it holds; honour anything past draft as the transition it is.
        requested_status = fetch_key(payload, :status).presence
        if requested_status.present? && Purchasing::OrderLifecycle.normalize(requested_status) != order.status
          Purchasing::TransitionOrder.call(order: order, to: requested_status)
        end

        return { status: "applied", entity_id: order.id, record: purchase_order_record(order), error: nil }
      when "update"
        order_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if order_id.blank?

        order = PurchaseOrder.find_by(org_id: org_id, id: order_id)
        return { status: "applied", entity_id: order_id, record: { id: order_id }, error: nil } if order.blank?

        attrs = purchase_order_edits(payload)
        # Edits land before the transition, so "these are the final lines, now approve it" — one
        # user action, queued offline as one command — still edits while the order is a draft.
        Purchasing::UpdateOrder.call(order: order, attrs: attrs) if Purchasing::UpdateOrder.edits?(attrs)

        if payload.key?("status") || payload.key?(:status)
          status = fetch_key(payload, :status).presence
          raise ArgumentError, "Missing field: status" if status.blank?

          Purchasing::TransitionOrder.call(order: order, to: status)
        end

        return { status: "applied", entity_id: order.id, record: purchase_order_record(order), error: nil }
      when "delete"
        order_id = fetch_key(payload, :id).presence
        raise ArgumentError, "Missing field: id" if order_id.blank?

        order = PurchaseOrder.find_by(org_id: org_id, id: order_id)
        if order.present?
          # Only a draft can be thrown away. Once the order has been approved the supplier has
          # seen it, so the record of it has to survive — cancel it instead.
          unless Purchasing::OrderLifecycle.editable?(order.status)
            raise ArgumentError, "Cannot delete a purchase order that is #{order.status}"
          end

          order.destroy!
        end

        return { status: "applied", entity_id: order_id, record: { id: order_id }, error: nil }
      end

      { status: "failed", entity_id: nil, record: nil, error: "Unsupported operation: #{item.operation}" }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    # Only the keys the command actually names, so a status-only command cannot blank the lines.
    def purchase_order_edits(payload)
      attrs = {}
      %i[supplier_id location_id items].each do |field|
        attrs[field] = fetch_key(payload, field) if payload.key?(field.to_s) || payload.key?(field)
      end
      if payload.key?("expected_at") || payload.key?(:expected_at)
        attrs[:expected_at] = parse_time(fetch_key(payload, :expected_at), field: "expected_at")
      end
      attrs
    end

    # Receiving moves stock, so like an inventory adjustment a receipt can only ever be created:
    # an update would have to unwind ledger entries. Correcting a mis-received quantity is an
    # inventory adjustment, which is exactly what it is.
    def apply_purchase_receipt(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      unless item.operation == "create"
        return {
          status: "failed",
          entity_id: fetch_key(payload, :id),
          record: payload,
          error: "Purchase receipts are immutable: #{item.operation} is not supported"
        }
      end

      receipt = Purchasing::ReceiveOrder.call(
        org_id: org_id,
        id: fetch_key(payload, :id).presence,
        purchase_order_id: fetch_key(payload, :purchase_order_id),
        received_at: fetch_key(payload, :received_at),
        items: fetch_key(payload, :items),
        received_by: actor_id(org_id, fetch_key(payload, :received_by)),
        idempotency_key: item.idempotency_key
      )

      { status: "applied", entity_id: receipt.id, record: purchase_receipt_record(receipt), error: nil }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def purchase_receipt_record(receipt)
      order = receipt.purchase_order

      {
        id: receipt.id,
        purchase_order_id: receipt.purchase_order_id,
        received_at: receipt.received_at&.iso8601(6),
        received_by: receipt.received_by,
        items: Purchasing::ReceiptLines.payload(receipt),
        # The receipt is what settled the order's status, so it travels with it — the client
        # folds the new status onto its own purchase-order row without a second round trip.
        purchase_order: { id: order.id, status: order.status, location_id: order.location_id }
      }
    end

    # A sale decrements stock, so its lines and payments can only ever be created — nothing here
    # edits them. The one thing that can change afterwards is a **void**, which rides `update`
    # carrying only `status: "voided"` (the pipeline speaks create/update/delete, the same reason
    # a purchase order's transitions ride `update`) and writes compensating movements rather than
    # rewriting history.
    def apply_sale(item)
      payload = normalize_hash(item.payload)
      org_id = item.org_id

      if item.operation == "update"
        status = fetch_key(payload, :status).to_s.strip.downcase
        unless status == "voided"
          return {
            status: "failed",
            entity_id: fetch_key(payload, :id),
            record: payload,
            error: "Sales are immutable: the only update a sale accepts is a void"
          }
        end

        sale = Sales::VoidSale.call(
          org_id: org_id,
          sale_id: fetch_key(payload, :id).presence,
          voided_by: actor_id(org_id, fetch_key(payload, :voided_by) || fetch_key(payload, :cashier_id)),
          reason: fetch_key(payload, :reason)
        )

        return { status: "applied", entity_id: sale.id, record: sale_record(sale), error: nil }
      end

      unless item.operation == "create"
        return {
          status: "failed",
          entity_id: fetch_key(payload, :id),
          record: payload,
          error: "Sales are immutable: #{item.operation} is not supported"
        }
      end

      sale = Sales::CreateSale.call(
        org_id: org_id,
        id: fetch_key(payload, :id).presence,
        location_id: fetch_key(payload, :location_id),
        sold_at: fetch_key(payload, :sold_at),
        items: fetch_key(payload, :items),
        payments: fetch_key(payload, :payments),
        cashier_id: actor_id(org_id, fetch_key(payload, :cashier_id)),
        idempotency_key: item.idempotency_key
      )

      { status: "applied", entity_id: sale.id, record: sale_record(sale), error: nil }
    rescue StandardError => e
      { status: "failed", entity_id: fetch_key(payload, :id), record: payload, error: e.message }
    end

    def sale_record(sale)
      # Indexed by idempotency_key, not variant_id: a cart may hold the same item on two lines,
      # and each line has its own movement.
      movements = InventoryMovement
        .where(org_id: sale.org_id, reference_type: "Sale", reference_id: sale.id)
        .index_by(&:idempotency_key)

      {
        id: sale.id,
        location_id: sale.location_id,
        cashier_id: sale.cashier_id,
        status: sale.status,
        # decimals as strings so the client's JSON parse cannot round them
        subtotal: sale.subtotal.to_s,
        discount: sale.discount.to_s,
        tax: sale.tax.to_s,
        total_amount: sale.total_amount.to_s,
        sold_at: sale.sold_at&.iso8601(6),
        items: Sales::SaleLines.payload(sale).map do |line|
          # so the pull feed can refresh on-hand without a second round trip, the way an
          # adjustment's and a receipt's change records do
          line.merge(
            on_hand: Inventory::OnHand.for(
              org_id: sale.org_id, variant_id: line.fetch(:variant_id), location_id: sale.location_id
            ).to_s,
            movement_id: movements["sale:#{sale.id}:#{line.fetch(:id)}"]&.id,
            # Only present once the sale has been voided. The client wrote its own optimistic
            # restore movements under local ids; without the server's id it could only delete
            # them, which would leave the device's ledger showing the sale but not its undoing.
            void_movement_id: movements["sale_void:#{sale.id}:#{line.fetch(:id)}"]&.id
          )
        end,
        payments: Sales::SalePayments.payload(sale)
      }
    end

    def supplier_record(supplier)
      {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address
      }
    end

    def purchase_order_record(order)
      {
        id: order.id,
        supplier_id: order.supplier_id,
        location_id: order.location_id,
        status: order.status,
        expected_at: order.expected_at&.iso8601(6),
        total_cost: order.total_cost.to_s,
        created_by: order.created_by,
        items: Purchasing::OrderLines.payload(order)
      }
    end

    def parse_time(value, field:)
      Iso8601Time.parse(value, field: field)
    end

    # Commands carry no session, so the client tells us who acted; ignore anyone outside the org.
    def actor_id(org_id, user_id)
      return nil if user_id.blank?
      return nil unless Inventory::RecordMovement::UUID_FORMAT.match?(user_id.to_s)

      User.where(org_id: org_id, id: user_id).exists? ? user_id : nil
    end

    def normalize_variant_options(value)
      raw = normalize_hash(value)
      out = {}
      raw.each do |k, v|
        key = k.to_s.strip
        next if key.blank?
        arr = v.is_a?(Array) ? v : [v]
        vals = arr.map { |x| x.to_s.strip }.reject(&:blank?)
        next if vals.empty?
        out[key] = vals
      end
      out
    end

    def write_audit_log(item, result)
      final_status = result.fetch(:status)
      action = final_status == "applied" ? "sync.applied" : "sync.failed"

      metadata = {
        outbox_id: item.id,
        idempotency_key: item.idempotency_key,
        client_id: item.client_id,
        operation: item.operation,
        status: final_status
      }
      metadata[:record] = result[:record] if result[:record].present?
      metadata[:error] = result[:error] if result[:error].present?

      AuditLog.create!(
        org_id: item.org_id,
        actor_user_id: nil,
        action: action,
        entity: item.entity,
        entity_id: result[:entity_id],
        metadata: metadata
      )
    end

    def normalize_hash(value)
      return value if value.is_a?(Hash)
      return value.to_unsafe_h if value.respond_to?(:to_unsafe_h)
      return value.to_h if value.respond_to?(:to_h)

      {}
    end

    def fetch_key(hash, key)
      hash[key.to_s] || hash[key]
    end
  end
end
