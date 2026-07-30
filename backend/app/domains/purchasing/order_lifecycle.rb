module Purchasing
  # The purchase-order state machine, kept as pure data so the sync handler, the REST
  # controller and (from Sprint E) the receiving path all guard against the same table
  # instead of each re-deciding what "already received" allows.
  #
  #   draft ──────────────▶ approved ──────────▶ partially_received ──▶ received ──▶ closed
  #     │                      │                        │
  #     └──▶ cancelled ◀───────┘                        └──▶ closed
  #
  # Cancelling stops at `approved`: once any stock has been received the ledger has entries
  # that a status change cannot undo, so a short delivery is short-*closed* instead. `closed`
  # and `cancelled` are terminal — reopening an order is a new order.
  class OrderLifecycle
    class InvalidTransition < ArgumentError; end

    # Mirrors the purchase_order_status pg enum. A value outside it would otherwise reach
    # Postgres as a raw StatementInvalid and poison the surrounding transaction.
    STATUSES = %w[draft approved partially_received received closed cancelled].freeze

    TRANSITIONS = {
      "draft" => %w[approved cancelled],
      "approved" => %w[partially_received received cancelled],
      "partially_received" => %w[received closed],
      "received" => %w[closed],
      "closed" => [],
      "cancelled" => []
    }.freeze

    # Statuses whose lines are still editable. Past this point the order is a commitment the
    # supplier has seen and receiving is matched against its lines, so changing them would
    # silently redefine what "fully received" means.
    EDITABLE_STATUSES = %w[draft].freeze

    class << self
      def status?(status)
        STATUSES.include?(normalize(status))
      end

      def terminal?(status)
        next_statuses(status).empty?
      end

      def editable?(status)
        EDITABLE_STATUSES.include?(normalize(status))
      end

      def next_statuses(status)
        TRANSITIONS.fetch(normalize(status), [])
      end

      def allowed?(from:, to:)
        next_statuses(from).include?(normalize(to))
      end

      # Raises with a message meant for the operator, not the log: the sync pipeline reports
      # `e.message` straight back to the device that queued the command.
      def validate!(from:, to:)
        origin = normalize(from)
        target = normalize(to)

        raise InvalidTransition, "Invalid purchase order status: #{target}" unless status?(target)
        return target if origin == target

        unless status?(origin)
          raise InvalidTransition, "Invalid purchase order status: #{origin}"
        end

        if terminal?(origin)
          raise InvalidTransition, "Cannot change the status of a purchase order that is #{origin}"
        end

        unless allowed?(from: origin, to: target)
          raise InvalidTransition, "Cannot move a purchase order from #{origin} to #{target}"
        end

        target
      end

      def normalize(status)
        status.to_s.strip.downcase
      end
    end
  end
end
