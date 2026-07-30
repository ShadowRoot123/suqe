require "rails_helper"

# The purchase-order state machine and the two services that write through it. Receiving itself
# lands in Sprint E; what is pinned here is which transitions it will be allowed to make.
RSpec.describe "Purchasing order lifecycle", type: :model do
  before { skip_if_no_db! }

  let(:org) { Organization.create!(name: "Lifecycle Org") }
  let(:supplier) { Supplier.create!(org_id: org.id, name: "Acme") }
  let(:location) { Location.create!(org_id: org.id, name: "Shop", type: "shop") }

  def create_variant!(sku:, org_id: org.id)
    product = Product.create!(org_id: org_id, name: "Product #{sku}")
    Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
  end

  def create_order!(items: nil, **overrides)
    Purchasing::CreateOrder.call(
      **{ org_id: org.id, supplier_id: supplier.id, location_id: location.id, items: items }.merge(overrides)
    )
  end

  describe Purchasing::OrderLifecycle do
    it "allows the forward path and nothing sideways" do
      expect(described_class.allowed?(from: "draft", to: "approved")).to be(true)
      expect(described_class.allowed?(from: "approved", to: "partially_received")).to be(true)
      expect(described_class.allowed?(from: "partially_received", to: "received")).to be(true)
      expect(described_class.allowed?(from: "received", to: "closed")).to be(true)

      expect(described_class.allowed?(from: "draft", to: "received")).to be(false)
      expect(described_class.allowed?(from: "received", to: "approved")).to be(false)
      expect(described_class.allowed?(from: "approved", to: "draft")).to be(false)
    end

    # Receiving cannot start on an order the supplier has never been sent.
    it "refuses to receive against a draft" do
      expect { described_class.validate!(from: "draft", to: "received") }
        .to raise_error(described_class::InvalidTransition, /from draft to received/)
      expect { described_class.validate!(from: "draft", to: "partially_received") }
        .to raise_error(described_class::InvalidTransition)
    end

    # Once stock has landed the ledger holds movements a status change cannot undo, so a short
    # delivery is short-closed rather than cancelled.
    it "allows cancelling only before anything has been received" do
      expect(described_class.allowed?(from: "draft", to: "cancelled")).to be(true)
      expect(described_class.allowed?(from: "approved", to: "cancelled")).to be(true)
      expect(described_class.allowed?(from: "partially_received", to: "cancelled")).to be(false)
      expect(described_class.allowed?(from: "partially_received", to: "closed")).to be(true)
    end

    it "treats closed and cancelled as terminal" do
      expect(described_class.terminal?("closed")).to be(true)
      expect(described_class.terminal?("cancelled")).to be(true)
      expect { described_class.validate!(from: "cancelled", to: "approved") }
        .to raise_error(described_class::InvalidTransition, /status of a purchase order that is cancelled/)
    end

    it "accepts a transition to the status the order is already in" do
      expect(described_class.validate!(from: "approved", to: "approved")).to eq("approved")
    end

    it "rejects a status that is not in the enum" do
      expect { described_class.validate!(from: "draft", to: "shipped") }
        .to raise_error(described_class::InvalidTransition, /Invalid purchase order status: shipped/)
    end

    it "counts only a draft as editable" do
      expect(described_class.editable?("draft")).to be(true)
      %w[approved partially_received received closed cancelled].each do |status|
        expect(described_class.editable?(status)).to be(false)
      end
    end
  end

  describe Purchasing::CreateOrder do
    it "opens a draft whose total comes from the lines" do
      variant = create_variant!(sku: "SKU-1")
      other = create_variant!(sku: "SKU-2")

      order = create_order!(items: [
        { variant_id: variant.id, quantity_ordered: "3", unit_cost: "2.50" },
        { variant_id: other.id, quantity_ordered: "1.5", unit_cost: "4.00" }
      ])

      expect(order.status).to eq("draft")
      expect(order.purchase_items.count).to eq(2)
      expect(order.total_cost).to eq("13.50".to_d)
    end

    # You open the order, then add to it — an empty draft is a normal starting point.
    it "opens an order with no lines at a total of zero" do
      order = create_order!
      expect(order.purchase_items).to be_empty
      expect(order.total_cost).to eq(0)
    end

    it "keeps the client's ids for the order and its lines" do
      variant = create_variant!(sku: "SKU-1")
      order_id = SecureRandom.uuid
      line_id = SecureRandom.uuid

      order = create_order!(
        id: order_id,
        items: [{ id: line_id, variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }]
      )

      expect(order.id).to eq(order_id)
      expect(order.purchase_items.first.id).to eq(line_id)
    end

    it "returns the original order when the same id is created twice" do
      variant = create_variant!(sku: "SKU-1")
      order_id = SecureRandom.uuid
      first = create_order!(id: order_id, items: [{ variant_id: variant.id, quantity_ordered: "2", unit_cost: "3" }])

      second = create_order!(id: order_id, items: [{ variant_id: variant.id, quantity_ordered: "2", unit_cost: "3" }])

      expect(second.id).to eq(first.id)
      expect(PurchaseOrder.where(org_id: org.id, id: order_id).count).to eq(1)
      expect(second.purchase_items.count).to eq(1)
    end

    it "refuses a supplier or location from another org" do
      rival = Organization.create!(name: "Rival")
      rival_supplier = Supplier.create!(org_id: rival.id, name: "Rival Supply")
      rival_location = Location.create!(org_id: rival.id, name: "Rival Shop", type: "shop")

      expect { create_order!(supplier_id: rival_supplier.id) }.to raise_error(ArgumentError, "Invalid supplier")
      expect { create_order!(location_id: rival_location.id) }.to raise_error(ArgumentError, "Invalid location")
    end

    it "refuses a variant from another org" do
      rival = Organization.create!(name: "Rival")
      rival_variant = create_variant!(sku: "SKU-RIVAL", org_id: rival.id)

      expect { create_order!(items: [{ variant_id: rival_variant.id, quantity_ordered: "1", unit_cost: "1" }]) }
        .to raise_error(ArgumentError, "Invalid variant")
    end

    it "refuses a quantity of zero, a negative cost and a non-numeric quantity" do
      variant = create_variant!(sku: "SKU-1")

      expect { create_order!(items: [{ variant_id: variant.id, quantity_ordered: "0", unit_cost: "1" }]) }
        .to raise_error(ArgumentError, /quantity_ordered must be greater than zero/)
      expect { create_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "-2" }]) }
        .to raise_error(ArgumentError, /unit_cost must not be negative/)
      expect { create_order!(items: [{ variant_id: variant.id, quantity_ordered: "two", unit_cost: "1" }]) }
        .to raise_error(ArgumentError, /quantity_ordered must be a number/)
    end

    # A second line for the same variant would make "ordered 5" ambiguous against a receipt.
    it "refuses two lines for the same variant" do
      variant = create_variant!(sku: "SKU-1")

      expect {
        create_order!(items: [
          { variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" },
          { variant_id: variant.id, quantity_ordered: "2", unit_cost: "1" }
        ])
      }.to raise_error(ArgumentError, /Duplicate line for variant/)
    end

    it "leaves no order behind when a line is rejected" do
      variant = create_variant!(sku: "SKU-1")

      expect {
        create_order!(items: [{ variant_id: variant.id, quantity_ordered: "-1", unit_cost: "1" }])
      }.to raise_error(ArgumentError)

      expect(PurchaseOrder.where(org_id: org.id).count).to eq(0)
    end
  end

  describe Purchasing::UpdateOrder do
    it "replaces the lines it is given and recomputes the total" do
      keep = create_variant!(sku: "SKU-KEEP")
      drop = create_variant!(sku: "SKU-DROP")
      order = create_order!(items: [
        { variant_id: keep.id, quantity_ordered: "1", unit_cost: "5" },
        { variant_id: drop.id, quantity_ordered: "1", unit_cost: "5" }
      ])
      kept_line_id = order.purchase_items.find_by(variant_id: keep.id).id

      described_class.call(order: order, attrs: {
        items: [{ id: kept_line_id, variant_id: keep.id, quantity_ordered: "4", unit_cost: "5" }]
      })

      expect(order.purchase_items.map(&:variant_id)).to eq([keep.id])
      # Matched by id, so the surviving row keeps its identity through an edit.
      expect(order.purchase_items.first.id).to eq(kept_line_id)
      expect(order.reload.total_cost).to eq(20.to_d)
    end

    it "leaves the lines alone when the edit does not mention them" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "2", unit_cost: "3" }])

      described_class.call(order: order, attrs: { expected_at: "2026-08-15T00:00:00Z" })

      expect(order.purchase_items.count).to eq(1)
      expect(order.reload.total_cost).to eq(6.to_d)
      expect(order.expected_at).to be_present
    end

    # `items: nil` means "leave them"; `items: []` means "empty the order".
    it "empties the order when the edit carries an empty line set" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "2", unit_cost: "3" }])

      described_class.call(order: order, attrs: { items: [] })

      expect(order.purchase_items).to be_empty
      expect(order.reload.total_cost).to eq(0)
    end

    it "refuses to edit anything past draft" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])
      Purchasing::TransitionOrder.call(order: order, to: "approved")

      expect { described_class.call(order: order, attrs: { items: [] }) }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /Cannot edit a purchase order that is approved/)
      expect(order.reload.purchase_items.count).to eq(1)
    end

    it "reports whether a payload contains an edit at all" do
      expect(described_class.edits?({ status: "approved" })).to be(false)
      expect(described_class.edits?({ "items" => [] })).to be(true)
      expect(described_class.edits?({ expected_at: nil })).to be(true)
    end
  end

  describe Purchasing::TransitionOrder do
    it "moves a draft with lines to approved" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])

      described_class.call(order: order, to: "approved")

      expect(order.reload.status).to eq("approved")
    end

    # Approving an empty order commits the org to buying nothing, and every receipt line has to
    # match a line on the order.
    it "refuses to approve an order with no lines" do
      order = create_order!

      expect { described_class.call(order: order, to: "approved") }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition, /at least one line/)
      expect(order.reload.status).to eq("draft")
    end

    it "refuses an illegal jump and leaves the status alone" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])

      expect { described_class.call(order: order, to: "received") }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition)
      expect(order.reload.status).to eq("draft")
    end

    it "is a no-op when the order is already in the requested status" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "1", unit_cost: "1" }])
      described_class.call(order: order, to: "approved")

      expect { described_class.call(order: order, to: "approved") }.not_to raise_error
      expect(order.reload.status).to eq("approved")
    end

    it "walks the whole receiving path" do
      variant = create_variant!(sku: "SKU-1")
      order = create_order!(items: [{ variant_id: variant.id, quantity_ordered: "10", unit_cost: "1" }])

      %w[approved partially_received received closed].each do |status|
        described_class.call(order: order, to: status)
        expect(order.reload.status).to eq(status)
      end

      expect { described_class.call(order: order, to: "cancelled") }
        .to raise_error(Purchasing::OrderLifecycle::InvalidTransition)
    end
  end
end
