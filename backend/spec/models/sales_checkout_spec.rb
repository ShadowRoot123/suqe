require "rails_helper"

# Finalising a sale. The invariants being pinned down are the ones that decide whether the books
# agree with the drawer: totals derived from the lines, payments adding up to the total, and
# stock decremented exactly once however many times the command arrives.
RSpec.describe Sales::CreateSale, type: :model do
  before { skip_if_no_db! }

  let(:org) { Organization.create!(name: "Till Org") }
  let(:location) { Location.create!(org_id: org.id, name: "Shop", type: "shop") }

  def create_variant!(sku:, org_id: org.id, status: "active")
    product = Product.create!(org_id: org_id, name: "Product #{sku}", status: status)
    Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
  end

  def stock!(variant, quantity, at: location)
    Inventory::RecordMovement.call(
      org_id: org.id, variant_id: variant.id, location_id: at.id,
      quantity_delta: quantity, type: "purchase", idempotency_key: "seed-#{variant.id}-#{at.id}"
    )
  end

  def sell!(items:, payments:, **overrides)
    described_class.call(
      **{ org_id: org.id, location_id: location.id, items: items, payments: payments }.merge(overrides)
    )
  end

  def line(variant, quantity: "1", unit_price: "10.00", **rest)
    { variant_id: variant.id, quantity: quantity, unit_price: unit_price, **rest }
  end

  def on_hand(variant, at: location)
    Inventory::OnHand.for(org_id: org.id, variant_id: variant.id, location_id: at.id)
  end

  describe "a completed sale" do
    it "writes the sale, its lines, its payments and one movement per line" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 10)

      sale = sell!(items: [line(variant, quantity: "3")], payments: [{ method: "cash", amount: "30.00" }])

      expect(sale.status).to eq("completed")
      expect(sale.sale_items.count).to eq(1)
      expect(sale.payments.count).to eq(1)
      expect(on_hand(variant)).to eq(7.to_d)

      movement = InventoryMovement.find_by(org_id: org.id, reference_type: "Sale", reference_id: sale.id)
      expect(movement.type).to eq("sale")
      expect(movement.quantity_delta).to eq(-3.to_d)
      expect(movement.location_id).to eq(location.id)
    end

    # The snapshot is only a cache of the ledger; RecordMovement is what keeps them together.
    # The old controller wrote the snapshot itself with interpolated SQL.
    it "keeps the snapshot in step with the ledger" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 10)

      sell!(items: [line(variant, quantity: "4")], payments: [{ method: "cash", amount: "40.00" }])

      snapshot = InventorySnapshot.find_by(org_id: org.id, variant_id: variant.id, location_id: location.id)
      expect(snapshot.quantity).to eq(on_hand(variant))
    end

    it "keeps the client's ids for the sale, its lines and its payments" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)
      sale_id = SecureRandom.uuid
      line_id = SecureRandom.uuid
      payment_id = SecureRandom.uuid

      sale = sell!(
        id: sale_id,
        items: [line(variant).merge(id: line_id)],
        payments: [{ id: payment_id, method: "cash", amount: "10.00" }]
      )

      expect(sale.id).to eq(sale_id)
      expect(sale.sale_items.first.id).to eq(line_id)
      expect(sale.payments.first.id).to eq(payment_id)
    end

    it "records the cashier and the time the sale was made" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)
      cashier = User.create!(org_id: org.id, name: "Till", email: "till@example.com", password_digest: "x")

      sale = sell!(
        cashier_id: cashier.id,
        sold_at: "2026-08-01T09:30:00Z",
        items: [line(variant)],
        payments: [{ method: "cash", amount: "10.00" }]
      )

      expect(sale.cashier_id).to eq(cashier.id)
      expect(sale.sold_at.iso8601).to eq("2026-08-01T09:30:00Z")
    end
  end

  describe "totals" do
    # Derived from the lines, never taken from the caller — the same rule as a purchase order's
    # total, and what stops a till talking the server into a cheaper sale.
    it "derives subtotal, discount, tax and total from the lines" do
      a = create_variant!(sku: "SKU-A")
      b = create_variant!(sku: "SKU-B")
      stock!(a, 10)
      stock!(b, 10)

      sale = sell!(
        items: [
          line(a, quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50"),
          line(b, quantity: "1", unit_price: "3.00", tax: "0.30")
        ],
        payments: [{ method: "cash", amount: "12.80" }]
      )

      expect(sale.subtotal).to eq("13.00".to_d)
      expect(sale.discount).to eq(1.to_d)
      expect(sale.tax).to eq("0.80".to_d)
      expect(sale.total_amount).to eq("12.80".to_d)
    end

    # Sum the exact line products, round once. Rounding each line first drifts from the client,
    # and the total would change under the cashier the moment the sale synced.
    it "rounds once at the end rather than per line" do
      variants = 3.times.map { |i| create_variant!(sku: "SKU-THIRD-#{i}") }
      variants.each { |v| stock!(v, 10) }

      sale = sell!(
        items: variants.map { |v| line(v, quantity: "0.333", unit_price: "1.00") },
        payments: [{ method: "cash", amount: "1.00" }]
      )

      expect(sale.subtotal).to eq("1.0".to_d)
      expect(sale.total_amount).to eq("1.0".to_d)
    end

    it "allows the same item on two lines at different discounts" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 10)

      sale = sell!(
        items: [
          line(variant, quantity: "1", unit_price: "10.00"),
          line(variant, quantity: "1", unit_price: "10.00", discount: "2.00")
        ],
        payments: [{ method: "cash", amount: "18.00" }]
      )

      expect(sale.sale_items.count).to eq(2)
      # Two lines, two movements, and the stock down by both.
      expect(InventoryMovement.where(reference_type: "Sale", reference_id: sale.id).count).to eq(2)
      expect(on_hand(variant)).to eq(8.to_d)
    end
  end

  describe "payments" do
    it "refuses a sale whose payments do not add up to the total" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      expect { sell!(items: [line(variant)], payments: [{ method: "cash", amount: "9.00" }]) }
        .to raise_error(ArgumentError, /10.00 due, 9.00 paid/)
      expect(Sale.where(org_id: org.id).count).to eq(0)
      expect(on_hand(variant)).to eq(5.to_d)
    end

    it "accepts a split across methods that adds up" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      sale = sell!(
        items: [line(variant)],
        payments: [{ method: "cash", amount: "4.00" }, { method: "card", amount: "6.00", reference: "auth-1" }]
      )

      expect(sale.payments.count).to eq(2)
      expect(sale.payments.map(&:method)).to contain_exactly("cash", "card")
    end

    it "refuses a payment method that is not one we know" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      expect { sell!(items: [line(variant)], payments: [{ method: "iou", amount: "10.00" }]) }
        .to raise_error(ArgumentError, /Invalid payment method: iou/)
    end

    it "refuses a sale with no payment at all" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      expect { sell!(items: [line(variant)], payments: []) }
        .to raise_error(ArgumentError, /needs at least one payment/)
    end
  end

  describe "replay" do
    # The command the whole offline story is for: a sale that reaches the server twice after a
    # flaky push must not sell the same goods twice.
    it "returns the original sale for the same idempotency key without decrementing again" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 10)
      args = { items: [line(variant, quantity: "3")], payments: [{ method: "cash", amount: "30.00" }] }

      first = sell!(**args, idempotency_key: "sale-1")
      second = sell!(**args, idempotency_key: "sale-1")

      expect(second.id).to eq(first.id)
      expect(Sale.where(org_id: org.id).count).to eq(1)
      expect(SaleItem.where(sale_id: first.id).count).to eq(1)
      expect(on_hand(variant)).to eq(7.to_d)
    end

    it "returns the original sale for the same sale id under a different key" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 10)
      sale_id = SecureRandom.uuid
      args = { id: sale_id, items: [line(variant, quantity: "2")], payments: [{ method: "cash", amount: "20.00" }] }

      sell!(**args, idempotency_key: "sale-1")
      second = sell!(**args, idempotency_key: "sale-2")

      expect(second.id).to eq(sale_id)
      expect(Sale.where(org_id: org.id).count).to eq(1)
      expect(on_hand(variant)).to eq(8.to_d)
      expect(InventoryMovement.where(org_id: org.id, type: "sale").count).to eq(1)
    end
  end

  describe "guards" do
    # FR-CAT-01. Archiving is how an item is taken off sale, and until now that was only enforced
    # in the client's search — the server would happily sell an archived product.
    it "refuses to sell an archived product" do
      variant = create_variant!(sku: "SKU-OLD", status: "archived")
      stock!(variant, 5)

      expect { sell!(items: [line(variant)], payments: [{ method: "cash", amount: "10.00" }]) }
        .to raise_error(ArgumentError, /archived and cannot be sold/)
      expect(Sale.where(org_id: org.id).count).to eq(0)
      expect(on_hand(variant)).to eq(5.to_d)
    end

    it "refuses a sale with no lines" do
      expect { sell!(items: [], payments: [{ method: "cash", amount: "1.00" }]) }
        .to raise_error(ArgumentError, /needs at least one line/)
    end

    it "refuses a variant or location from another org" do
      rival = Organization.create!(name: "Rival")
      rival_variant = create_variant!(sku: "SKU-RIVAL", org_id: rival.id)
      rival_location = Location.create!(org_id: rival.id, name: "Rival Shop", type: "shop")
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      expect { sell!(items: [line(rival_variant)], payments: [{ method: "cash", amount: "10.00" }]) }
        .to raise_error(ArgumentError, "Invalid variant")
      expect {
        sell!(location_id: rival_location.id, items: [line(variant)], payments: [{ method: "cash", amount: "10.00" }])
      }.to raise_error(ArgumentError, "Invalid location")
    end

    it "refuses a zero quantity, a negative price and a discount bigger than the line" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)
      cash = [{ method: "cash", amount: "10.00" }]

      expect { sell!(items: [line(variant, quantity: "0")], payments: cash) }
        .to raise_error(ArgumentError, /quantity must be greater than zero/)
      expect { sell!(items: [line(variant, unit_price: "-1")], payments: cash) }
        .to raise_error(ArgumentError, /unit_price must not be negative/)
      expect { sell!(items: [line(variant, unit_price: "5.00", discount: "6.00")], payments: cash) }
        .to raise_error(ArgumentError, /discount must not be greater than the line total/)
    end

    it "refuses an unparseable sold_at rather than silently stamping now" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 5)

      expect {
        sell!(sold_at: "yesterday evening", items: [line(variant)], payments: [{ method: "cash", amount: "10.00" }])
      }.to raise_error(ArgumentError, "sold_at must be an ISO 8601 date")
    end

    # Either the whole sale lands or none of it does — a rejected second line must not leave the
    # first one's stock decremented.
    it "leaves nothing behind when one line of a sale is rejected" do
      good = create_variant!(sku: "SKU-GOOD")
      archived = create_variant!(sku: "SKU-ARCHIVED", status: "archived")
      stock!(good, 5)

      expect {
        sell!(items: [line(good), line(archived)], payments: [{ method: "cash", amount: "20.00" }])
      }.to raise_error(ArgumentError)

      expect(Sale.where(org_id: org.id).count).to eq(0)
      expect(on_hand(good)).to eq(5.to_d)
    end

    # Deliberate: an offline sale has already happened in the shop by the time it reaches the
    # server, so refusing it for insufficient stock would throw away a real transaction. Negative
    # on-hand is a signal to investigate, not a reason to reject history.
    it "sells stock it does not have rather than refusing a sale that already happened" do
      variant = create_variant!(sku: "SKU-1")
      stock!(variant, 1)

      sale = sell!(items: [line(variant, quantity: "4")], payments: [{ method: "cash", amount: "40.00" }])

      expect(sale).to be_present
      expect(on_hand(variant)).to eq(-3.to_d)
    end
  end
end
