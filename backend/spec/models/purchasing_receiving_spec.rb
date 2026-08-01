require "rails_helper"

# Receiving goods against a purchase order. The thing being pinned down here is that stock
# lands in the ledger exactly once per receipt, and that the order's status is a summary of
# what actually arrived rather than something a caller can assert.
RSpec.describe Purchasing::ReceiveOrder, type: :model do
  before { skip_if_no_db! }

  let(:org) { Organization.create!(name: "Receiving Org") }
  let(:supplier) { Supplier.create!(org_id: org.id, name: "Acme") }
  let(:location) { Location.create!(org_id: org.id, name: "Dock", type: "warehouse") }

  def create_variant!(sku:, org_id: org.id)
    product = Product.create!(org_id: org_id, name: "Product #{sku}")
    Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
  end

  # An order the supplier has been sent — the only state receiving can start from.
  def approved_order!(items:, **overrides)
    order = Purchasing::CreateOrder.call(
      **{ org_id: org.id, supplier_id: supplier.id, location_id: location.id, items: items }.merge(overrides)
    )
    Purchasing::TransitionOrder.call(order: order, to: "approved")
    order
  end

  def receive!(order, items:, **overrides)
    described_class.call(
      **{ org_id: org.id, purchase_order_id: order.id, items: items }.merge(overrides)
    )
  end

  def on_hand(variant, at: location)
    Inventory::OnHand.for(org_id: org.id, variant_id: variant.id, location_id: at.id)
  end

  describe "a full delivery" do
    it "writes the receipt, moves the stock and marks the order received" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "2.50" }])

      receipt = receive!(order, items: [{ variant_id: variant.id, quantity_received: "10" }])

      expect(receipt.purchase_receipt_items.count).to eq(1)
      expect(order.reload.status).to eq("received")
      expect(on_hand(variant)).to eq(10.to_d)

      movement = InventoryMovement.find_by(org_id: org.id, reference_type: "PurchaseReceipt", reference_id: receipt.id)
      expect(movement.type).to eq("purchase")
      expect(movement.location_id).to eq(location.id)
      expect(movement.quantity_delta).to eq(10.to_d)
    end

    # The snapshot is only a cache of the ledger, and RecordMovement is what keeps the two
    # together — the old controller wrote the snapshot itself with hand-rolled SQL.
    it "keeps the snapshot in step with the ledger" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "4", unit_cost: "1" }])

      receive!(order, items: [{ variant_id: variant.id, quantity_received: "4" }])

      snapshot = InventorySnapshot.find_by(org_id: org.id, variant_id: variant.id, location_id: location.id)
      expect(snapshot.quantity).to eq(on_hand(variant))
    end

    it "records the cost the line was ordered at when the receipt does not name one" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "3", unit_cost: "7.25" }])

      receipt = receive!(order, items: [{ variant_id: variant.id, quantity_received: "3" }])

      expect(receipt.purchase_receipt_items.first.unit_cost).to eq("7.25".to_d)
    end

    # FR-PO-02: what the delivery actually cost is recorded per receipt line, which is not
    # always what the order quoted.
    it "records a unit cost the receipt names instead" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "3", unit_cost: "7.25" }])

      receipt = receive!(order, items: [{ variant_id: variant.id, quantity_received: "3", unit_cost: "8.00" }])

      expect(receipt.purchase_receipt_items.first.unit_cost).to eq(8.to_d)
      # The order still says what it committed to; the receipt says what arrived.
      expect(order.reload.total_cost).to eq("21.75".to_d)
    end

    it "keeps the client's ids for the receipt and its lines" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])
      receipt_id = SecureRandom.uuid
      line_id = SecureRandom.uuid

      receipt = receive!(order, id: receipt_id,
                                items: [{ id: line_id, variant_id: variant.id, quantity_received: "1" }])

      expect(receipt.id).to eq(receipt_id)
      expect(receipt.purchase_receipt_items.first.id).to eq(line_id)
    end
  end

  describe "a partial delivery" do
    it "marks the order partially received and completes it on the second receipt" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])

      receive!(order, items: [{ variant_id: variant.id, quantity_received: "4" }])
      expect(order.reload.status).to eq("partially_received")
      expect(on_hand(variant)).to eq(4.to_d)

      receive!(order, items: [{ variant_id: variant.id, quantity_received: "6" }])
      expect(order.reload.status).to eq("received")
      expect(on_hand(variant)).to eq(10.to_d)
    end

    # "Fully received" is a question asked per line: one variant complete and another missing
    # is not a completed order, however the totals happen to add up.
    it "stays partially received while any line is short" do
      full = create_variant!(sku: "SKU-FULL")
      short = create_variant!(sku: "SKU-SHORT")
      order = approved_order!(items: [
        { variant_id: full.id, quantity_ordered: "2", unit_cost: "1" },
        { variant_id: short.id, quantity_ordered: "2", unit_cost: "1" }
      ])

      receive!(order, items: [
        { variant_id: full.id, quantity_received: "2" },
        { variant_id: short.id, quantity_received: "1" }
      ])

      expect(order.reload.status).to eq("partially_received")
    end

    it "counts what earlier receipts already booked in when checking the outstanding quantity" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])
      receive!(order, items: [{ variant_id: variant.id, quantity_received: "7" }])

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "4" }]) }
        .to raise_error(ArgumentError, /Cannot receive more than ordered/)
      expect(on_hand(variant)).to eq(7.to_d)
    end
  end

  describe "replay" do
    # The whole point of the offline pipeline: the same command reaching the server twice must
    # not book the goods in twice.
    it "returns the original receipt for the same idempotency key without moving stock again" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])
      items = [{ variant_id: variant.id, quantity_received: "6" }]

      first = receive!(order, items: items, idempotency_key: "receive-1")
      second = receive!(order, items: items, idempotency_key: "receive-1")

      expect(second.id).to eq(first.id)
      expect(PurchaseReceipt.where(org_id: org.id).count).to eq(1)
      expect(on_hand(variant)).to eq(6.to_d)
    end

    # A device that re-queues the same receipt under a fresh outbox row still owns the receipt
    # id, which is the second guard.
    it "returns the original receipt for the same receipt id under a different key" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])
      receipt_id = SecureRandom.uuid
      items = [{ variant_id: variant.id, quantity_received: "6" }]

      receive!(order, id: receipt_id, items: items, idempotency_key: "receive-1")
      second = receive!(order, id: receipt_id, items: items, idempotency_key: "receive-2")

      expect(second.id).to eq(receipt_id)
      expect(PurchaseReceipt.where(org_id: org.id).count).to eq(1)
      expect(on_hand(variant)).to eq(6.to_d)
      expect(order.reload.status).to eq("partially_received")
    end

    it "replays a receipt that completed an order without reopening or double counting it" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "5", unit_cost: "1" }])
      items = [{ variant_id: variant.id, quantity_received: "5" }]

      receive!(order, items: items, idempotency_key: "receive-1")
      receive!(order, items: items, idempotency_key: "receive-1")

      expect(order.reload.status).to eq("received")
      expect(on_hand(variant)).to eq(5.to_d)
      expect(InventoryMovement.where(org_id: org.id, type: "purchase").count).to eq(1)
    end
  end

  describe "guards" do
    it "refuses to receive against a draft" do
      variant = create_variant!(sku: "SKU-1")
      order = Purchasing::CreateOrder.call(
        org_id: org.id, supplier_id: supplier.id, location_id: location.id,
        items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }]
      )

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "1" }]) }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /that is draft/)
      expect(PurchaseReceipt.where(org_id: org.id).count).to eq(0)
      expect(on_hand(variant)).to eq(0)
    end

    it "refuses to receive against a cancelled or closed order" do
      variant = create_variant!(sku: "SKU-1")
      cancelled = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])
      Purchasing::TransitionOrder.call(order: cancelled, to: "cancelled")

      expect { receive!(cancelled, items: [{ variant_id: variant.id, quantity_received: "1" }]) }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /that is cancelled/)
    end

    # Once the last line has landed there is nothing left to book in, and the order says so.
    it "refuses to receive against an order that is already fully received" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "2", unit_cost: "1" }])
      receive!(order, items: [{ variant_id: variant.id, quantity_received: "2" }])
      expect(order.reload.status).to eq("received")

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "1" }]) }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /that is received/)
      expect(on_hand(variant)).to eq(2.to_d)
    end

    # A short delivery is short-closed rather than cancelled — the ledger holds movements a status
    # change cannot undo — and closing ends the order for receiving too.
    it "refuses to receive against an order that was short-closed" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])
      receive!(order, items: [{ variant_id: variant.id, quantity_received: "3" }])
      # ReceiveOrder settles the status on its own instance, so this one is stale until reloaded.
      expect(order.reload.status).to eq("partially_received")
      Purchasing::TransitionOrder.call(order: order, to: "closed")

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "1" }]) }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /that is closed/)
      expect(on_hand(variant)).to eq(3.to_d)
    end

    it "refuses a line for a variant that is not on the order" do
      ordered = create_variant!(sku: "SKU-ORDERED")
      other = create_variant!(sku: "SKU-OTHER")
      order = approved_order!(items: [{ variant_id: ordered.id, quantity_ordered: "1", unit_cost: "1" }])

      expect { receive!(order, items: [{ variant_id: other.id, quantity_received: "1" }]) }
        .to raise_error(ArgumentError, /is not on this purchase order/)
    end

    it "refuses more than was ordered and says how much is outstanding" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "3", unit_cost: "1" }])

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "4" }]) }
        .to raise_error(ArgumentError, /3.0 outstanding/)
    end

    it "refuses a receipt with no lines" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])

      expect { receive!(order, items: []) }
        .to raise_error(ArgumentError, /needs at least one line/)
      expect(order.reload.status).to eq("approved")
    end

    it "refuses a zero, negative or non-numeric quantity" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "5", unit_cost: "1" }])

      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "0" }]) }
        .to raise_error(ArgumentError, /quantity_received must be greater than zero/)
      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "-1" }]) }
        .to raise_error(ArgumentError, /quantity_received must be greater than zero/)
      expect { receive!(order, items: [{ variant_id: variant.id, quantity_received: "some" }]) }
        .to raise_error(ArgumentError, /quantity_received must be a number/)
    end

    it "refuses two lines for the same variant in one receipt" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "5", unit_cost: "1" }])

      expect {
        receive!(order, items: [
          { variant_id: variant.id, quantity_received: "1" },
          { variant_id: variant.id, quantity_received: "2" }
        ])
      }.to raise_error(ArgumentError, /Duplicate line for variant/)
    end

    it "refuses an unparseable received_at rather than silently stamping now" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])

      expect {
        receive!(order, received_at: "last thursday", items: [{ variant_id: variant.id, quantity_received: "1" }])
      }.to raise_error(ArgumentError, "received_at must be an ISO 8601 date")
    end

    it "does not reach another org's order" do
      rival = Organization.create!(name: "Rival")
      rival_supplier = Supplier.create!(org_id: rival.id, name: "Rival Supply")
      rival_location = Location.create!(org_id: rival.id, name: "Rival Dock", type: "warehouse")
      rival_variant = create_variant!(sku: "SKU-RIVAL", org_id: rival.id)
      rival_order = Purchasing::CreateOrder.call(
        org_id: rival.id, supplier_id: rival_supplier.id, location_id: rival_location.id,
        items: [{ variant_id: rival_variant.id, quantity_ordered: "1", unit_cost: "1" }]
      )
      Purchasing::TransitionOrder.call(order: rival_order, to: "approved")

      expect { receive!(rival_order, items: [{ variant_id: rival_variant.id, quantity_received: "1" }]) }
        .to raise_error(ArgumentError, "Invalid purchase order")
      expect(PurchaseReceipt.where(purchase_order_id: rival_order.id).count).to eq(0)
    end

    # Either the whole delivery lands or none of it does: a rejected second line must not leave
    # the first one's stock in the ledger.
    it "leaves nothing behind when one line of a receipt is rejected" do
      good = create_variant!(sku: "SKU-GOOD")
      bad = create_variant!(sku: "SKU-BAD")
      order = approved_order!(items: [
        { variant_id: good.id, quantity_ordered: "5", unit_cost: "1" },
        { variant_id: bad.id, quantity_ordered: "5", unit_cost: "1" }
      ])

      expect {
        receive!(order, items: [
          { variant_id: good.id, quantity_received: "5" },
          { variant_id: bad.id, quantity_received: "50" }
        ])
      }.to raise_error(ArgumentError)

      expect(PurchaseReceipt.where(org_id: org.id).count).to eq(0)
      expect(on_hand(good)).to eq(0)
      expect(order.reload.status).to eq("approved")
    end
  end

  describe "the change-feed payload" do
    it "carries the lines, their movements, the on-hand they landed at and the order's status" do
      variant = create_variant!(sku: "SKU-1")
      order = approved_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1.50" }])
      receipt = receive!(order, items: [{ variant_id: variant.id, quantity_received: "4" }])

      line = Purchasing::ReceiptLines.payload(receipt).first

      # decimals as strings, so the client's JSON parse cannot round them
      expect(line).to include(
        variant_id: variant.id, quantity_received: "4.0", unit_cost: "1.5", on_hand: "4.0"
      )
      expect(line[:movement_id]).to be_present
      expect(InventoryMovement.find(line[:movement_id]).quantity_delta).to eq(4.to_d)
    end
  end
end
