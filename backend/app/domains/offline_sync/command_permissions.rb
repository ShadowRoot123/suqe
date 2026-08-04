module OfflineSync
  # Which permission each sync command needs, checked at push time.
  #
  # This exists because `sync/push` is the app's **primary write path** — every mobile write is a
  # command, and the REST controllers are for the future web/admin surface — and it was
  # authenticated only. `require_permission!` guarded the REST endpoints while the same write,
  # phrased as a command, went through unasked. A role was in practice a suggestion to the UI:
  # the client hides a screen, and anything that can reach the API issues the command anyway.
  #
  # Checked at **push**, not while applying. `ProcessPending` runs from `sync/pull` (and could run
  # from a job) with no caller in scope — by then the command is a stored intention and there is
  # nobody left to ask. Push is the last point where the request still has a user on it.
  #
  # Refused commands come back as `invalid`, which the client already treats as final: it marks
  # them `rejected` in the outbox rather than retrying forever (`pushPending` in `syncEngine.ts`).
  # The rest of the batch still goes through, so one refusal cannot strand an outbox.
  #
  # Keys match the REST controllers' `require_permission!` and the client's `RequirePermissions`
  # route gates, so a screen a role can open is a command it can push. The one place those two
  # disagreed is noted on `stock_threshold` below.
  module CommandPermissions
    # entity => permission key, or a hash of operation => key with a `default:`.
    RULES = {
      "category" => "catalog.write",
      "product" => "catalog.write",
      "variant" => "catalog.write",
      "product_group" => "catalog.write",
      "product_group_membership" => "catalog.write",
      "location" => "locations.write",
      "inventory_adjustment" => "inventory.adjust",
      # The client gates its threshold screen on `inventory.adjust`, so that is what is required
      # here — matching the UI rather than the unused `inventory.low_stock_config`, which nothing
      # in the app has ever checked. Worth reconciling, but not by locking people out first.
      "stock_threshold" => "inventory.adjust",
      "supplier" => "purchasing.write",
      "purchase_order" => "purchasing.write",
      "purchase_receipt" => "purchasing.receive",
      # Selling and undoing a sale are different jobs — the same split the REST endpoint makes,
      # and the reason `pos.void_sale` exists separately. A void is the only `update` a sale takes.
      "sale" => { "update" => "pos.void_sale", default: "pos.sell" }
    }.freeze

    class UnknownEntity < StandardError; end

    # The permission key `entity`/`operation` needs. Raises for an entity we do not recognise:
    # an unknown entity cannot be permission-checked, and `ProcessPending` treats one as an
    # applied no-op, so accepting it would mean waving through an unauthorised write on the
    # strength of a typo. Fail closed.
    def self.key_for(entity:, operation:)
      rule = RULES[entity.to_s]
      raise UnknownEntity, entity.to_s if rule.nil?
      return rule if rule.is_a?(String)

      rule[operation.to_s] || rule.fetch(:default)
    end

    def self.permits?(user, key)
      return false if user.blank?

      user.roles.joins(:permissions).where(permissions: { key: key }).exists?
    end
  end
end
