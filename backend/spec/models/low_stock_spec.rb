require "rails_helper"

RSpec.describe Inventory::LowStock, type: :model do
  before { skip_if_no_db! }

  let(:org) { Organization.create!(name: "Acme") }
  let(:other_org) { Organization.create!(name: "Rival") }
  let(:shop) { Location.create!(org_id: org.id, name: "Shop", type: "shop") }
  let(:warehouse) { Location.create!(org_id: org.id, name: "Warehouse", type: "warehouse") }

  def variant_for(organization, sku:)
    product = Product.create!(org_id: organization.id, name: "Product #{sku}")
    Variant.create!(org_id: organization.id, product_id: product.id, sku: sku, attrs: {})
  end

  let(:variant) { variant_for(org, sku: "SKU-1") }

  def adjust!(quantity, location: shop, variant: self.variant)
    Inventory::RecordMovement.call(
      org_id: org.id,
      variant_id: variant.id,
      location_id: location.id,
      quantity_delta: quantity
    )
  end

  def threshold!(point, location: nil, variant: self.variant, quantity: nil, organization: org)
    StockThreshold.create!(
      org_id: organization.id,
      variant_id: variant.id,
      location_id: location&.id,
      reorder_point: point,
      reorder_quantity: quantity
    )
  end

  describe ".effective" do
    it "prefers the row naming the location over the variant-wide default" do
      threshold!("5")
      threshold!("20", location: shop)

      expect(described_class.effective(org_id: org.id, variant_id: variant.id, location_id: shop.id).reorder_point).to eq(20.to_d)
      expect(described_class.effective(org_id: org.id, variant_id: variant.id, location_id: warehouse.id).reorder_point).to eq(5.to_d)
    end

    it "returns nil when nothing is configured" do
      adjust!("3")

      expect(described_class.effective(org_id: org.id, variant_id: variant.id, location_id: shop.id)).to be_nil
    end
  end

  describe ".rows" do
    it "reports a variant at or below its reorder point and leaves one above it alone" do
      threshold!("5")
      adjust!("5", location: shop)
      adjust!("9", location: warehouse)

      rows = described_class.rows(org_id: org.id)

      expect(rows.map(&:location_id)).to eq([shop.id])
      expect(rows.first.on_hand).to eq(5.to_d)
      expect(rows.first.reorder_point).to eq(5.to_d)
      expect(rows.first.shortfall).to eq(0.to_d)
    end

    it "never reports a variant with no threshold, however low it is" do
      adjust!("-4")

      expect(described_class.rows(org_id: org.id)).to be_empty
    end

    # An unset threshold is not a threshold of zero, but a threshold *of* zero is real: it says
    # "tell me when this runs out".
    it "treats a reorder point of zero as a real threshold" do
      threshold!("0")
      adjust!("2")

      expect(described_class.rows(org_id: org.id)).to be_empty

      adjust!("-2")

      expect(described_class.rows(org_id: org.id).map(&:on_hand)).to eq([0.to_d])
    end

    it "reports a location-specific threshold with no ledger history at zero on hand" do
      threshold!("3", location: warehouse)

      rows = described_class.rows(org_id: org.id)

      expect(rows.map(&:location_id)).to eq([warehouse.id])
      expect(rows.first.on_hand).to eq(0.to_d)
      expect(rows.first.shortfall).to eq(3.to_d)
    end

    # The variant-wide default cannot do the same without crossing every variant with every
    # location the org has ever opened.
    it "does not invent rows for a variant-wide default at locations stock never reached" do
      threshold!("3")
      adjust!("1", location: shop)

      expect(described_class.rows(org_id: org.id).map(&:location_id)).to eq([shop.id])
    end

    it "orders by the largest shortfall first" do
      low = variant_for(org, sku: "SKU-LOW")
      threshold!("10", variant: low)
      threshold!("10")
      adjust!("8", variant: variant)
      adjust!("1", variant: low)

      expect(described_class.rows(org_id: org.id).map(&:variant_id)).to eq([low.id, variant.id])
    end

    it "filters to one location and still honours the variant-wide default there" do
      threshold!("5")
      adjust!("1", location: shop)
      adjust!("1", location: warehouse)

      rows = described_class.rows(org_id: org.id, location_id: shop.id)

      expect(rows.map(&:location_id)).to eq([shop.id])
    end

    it "does not leak another org's thresholds" do
      other_variant = variant_for(other_org, sku: "SKU-OTHER")
      StockThreshold.create!(org_id: other_org.id, variant_id: other_variant.id, reorder_point: "100")
      threshold!("5")
      adjust!("1")

      rows = described_class.rows(org_id: org.id)

      expect(rows.map(&:variant_id)).to eq([variant.id])
    end
  end
end
