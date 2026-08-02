require "rails_helper"

# Undoing a sale. The ledger is append-only, so a void writes the opposite of the sale rather than
# deleting anything — what is pinned here is that stock comes back exactly once, that the original
# movements survive, and that a replayed void is harmless.
RSpec.describe Sales::VoidSale, type: :model do
  before { skip_if_no_db! }

  let(:org) { Organization.create!(name: "Void Org") }
  let(:location) { Location.create!(org_id: org.id, name: "Shop", type: "shop") }

  def create_variant!(sku:, org_id: org.id)
    product = Product.create!(org_id: org_id, name: "Product #{sku}")
    Variant.create!(org_id: org_id, product_id: product.id, sku: sku, attrs: {})
  end

  def stock!(variant, quantity)
    Inventory::RecordMovement.call(
      org_id: org.id, variant_id: variant.id, location_id: location.id,
      quantity_delta: quantity, type: "purchase", idempotency_key: "seed-#{variant.id}"
    )
  end

  def sell!(items:, payments:)
    Sales::CreateSale.call(org_id: org.id, location_id: location.id, items: items, payments: payments)
  end

  def on_hand(variant)
    Inventory::OnHand.for(org_id: org.id, variant_id: variant.id, location_id: location.id)
  end

  def void!(sale, **overrides)
    described_class.call(**{ org_id: org.id, sale_id: sale.id }.merge(overrides))
  end

  it "puts the stock back and marks the sale voided" do
    variant = create_variant!(sku: "SKU-1")
    stock!(variant, 10)
    sale = sell!(items: [{ variant_id: variant.id, quantity: "3", unit_price: "5.00" }],
                 payments: [{ method: "cash", amount: "15.00" }])
    expect(on_hand(variant)).to eq(7.to_d)

    void!(sale)

    expect(sale.reload.status).to eq("voided")
    expect(on_hand(variant)).to eq(10.to_d)
  end

  # Nothing is deleted and no movement is edited: the pair of movements tells the true story.
  it "leaves the original sale movements in place and writes the opposite alongside them" do
    variant = create_variant!(sku: "SKU-1")
    stock!(variant, 10)
    sale = sell!(items: [{ variant_id: variant.id, quantity: "2", unit_price: "5.00" }],
                 payments: [{ method: "cash", amount: "10.00" }])

    void!(sale)

    movements = InventoryMovement.where(org_id: org.id, reference_type: "Sale", reference_id: sale.id)
    expect(movements.count).to eq(2)
    expect(movements.map(&:quantity_delta)).to contain_exactly(-2.to_d, 2.to_d)
    # A void is the till correcting itself, not a customer bringing goods back.
    expect(movements.map(&:type)).to contain_exactly("sale", "adjustment")
  end

  it "records who voided it and why" do
    variant = create_variant!(sku: "SKU-1")
    stock!(variant, 5)
    user = User.create!(org_id: org.id, name: "Boss", email: "boss@example.com")
    sale = sell!(items: [{ variant_id: variant.id, quantity: "1", unit_price: "5.00" }],
                 payments: [{ method: "cash", amount: "5.00" }])

    void!(sale, voided_by: user.id, reason: "Wrong item scanned")

    movement = InventoryMovement.find_by(org_id: org.id, type: "adjustment", reference_id: sale.id)
    expect(movement.created_by).to eq(user.id)
    expect(movement.note).to eq("Wrong item scanned")
  end

  it "puts every line back, not just the first" do
    a = create_variant!(sku: "SKU-A")
    b = create_variant!(sku: "SKU-B")
    stock!(a, 10)
    stock!(b, 10)
    sale = sell!(
      items: [
        { variant_id: a.id, quantity: "2", unit_price: "5.00" },
        { variant_id: b.id, quantity: "3", unit_price: "1.00" }
      ],
      payments: [{ method: "cash", amount: "13.00" }]
    )

    void!(sale)

    expect(on_hand(a)).to eq(10.to_d)
    expect(on_hand(b)).to eq(10.to_d)
  end

  # The mandatory replay guard: a void that arrives twice must not put the stock back twice.
  it "is harmless when it arrives twice" do
    variant = create_variant!(sku: "SKU-1")
    stock!(variant, 10)
    sale = sell!(items: [{ variant_id: variant.id, quantity: "4", unit_price: "1.00" }],
                 payments: [{ method: "cash", amount: "4.00" }])

    void!(sale)
    void!(sale)

    expect(on_hand(variant)).to eq(10.to_d)
    expect(InventoryMovement.where(org_id: org.id, type: "adjustment", reference_id: sale.id).count).to eq(1)
    expect(sale.reload.status).to eq("voided")
  end

  it "keeps the sale's own totals — a void does not rewrite what was rung up" do
    variant = create_variant!(sku: "SKU-1")
    stock!(variant, 10)
    sale = sell!(items: [{ variant_id: variant.id, quantity: "2", unit_price: "5.00" }],
                 payments: [{ method: "cash", amount: "10.00" }])

    void!(sale)

    expect(sale.reload.total_amount).to eq(10.to_d)
    expect(sale.sale_items.count).to eq(1)
    expect(sale.payments.count).to eq(1)
  end

  it "refuses a sale from another org" do
    rival = Organization.create!(name: "Rival")
    rival_location = Location.create!(org_id: rival.id, name: "Rival Shop", type: "shop")
    rival_variant = create_variant!(sku: "SKU-RIVAL", org_id: rival.id)
    Inventory::RecordMovement.call(
      org_id: rival.id, variant_id: rival_variant.id, location_id: rival_location.id,
      quantity_delta: "5", type: "purchase", idempotency_key: "seed-rival"
    )
    rival_sale = Sales::CreateSale.call(
      org_id: rival.id, location_id: rival_location.id,
      items: [{ variant_id: rival_variant.id, quantity: "1", unit_price: "1.00" }],
      payments: [{ method: "cash", amount: "1.00" }]
    )

    expect { void!(rival_sale) }.to raise_error(ArgumentError, "Invalid sale")
    expect(rival_sale.reload.status).to eq("completed")
  end

  it "refuses a sale that does not exist" do
    expect { described_class.call(org_id: org.id, sale_id: SecureRandom.uuid) }
      .to raise_error(ArgumentError, "Invalid sale")
    expect { described_class.call(org_id: org.id, sale_id: nil) }
      .to raise_error(ArgumentError, "Missing field: id")
  end
end
