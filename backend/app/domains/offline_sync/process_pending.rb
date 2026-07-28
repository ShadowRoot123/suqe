module OfflineSync
  class ProcessPending
    SUPPORTED_OPERATIONS = %w[create update delete].freeze

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
            Category.create!(id: requested_id, org_id: org_id, name: name, parent_id: parent_id)
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
            Product.create!(attrs)
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
            Variant.create!(create_attrs.merge({ attrs: (variant_attrs.presence || {}) }))
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
            ProductGroup.create!(id: requested_id, org_id: org_id, name: name, variant_options: variant_options)
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
            ProductGroupMembership.create!(
              id: requested_id,
              org_id: org_id,
              product_group_id: product_group_id,
              product_id: product_id
            )
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
