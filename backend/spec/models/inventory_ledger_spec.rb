require "rails_helper"

RSpec.describe "Inventory ledger", type: :model do
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

  def adjust!(quantity, location: shop, variant: self.variant, key: nil)
    Inventory::RecordMovement.call(
      org_id: org.id,
      variant_id: variant.id,
      location_id: location.id,
      quantity_delta: quantity,
      idempotency_key: key
    )
  end

  describe Inventory::RecordMovement do
    it "writes a movement and updates the snapshot cache" do
      movement = adjust!("5")

      expect(movement.type).to eq("adjustment")
      expect(movement.quantity_delta).to eq(5.to_d)
      expect(
        InventorySnapshot.find_by(org_id: org.id, variant_id: variant.id, location_id: shop.id).quantity
      ).to eq(5.to_d)
    end

    it "returns the original movement when the same idempotency_key is replayed" do
      first = adjust!("5", key: "same")
      second = adjust!("5", key: "same")

      expect(second.id).to eq(first.id)
      expect(InventoryMovement.where(org_id: org.id).count).to eq(1)
      expect(
        InventorySnapshot.find_by(org_id: org.id, variant_id: variant.id, location_id: shop.id).quantity
      ).to eq(5.to_d)
    end

    it "leaves the snapshot untouched when the movement is rejected" do
      expect { adjust!("0") }.to raise_error(ArgumentError, /zero/)
      expect { adjust!("") }.to raise_error(ArgumentError, /quantity_delta/)
      expect { adjust!("5", variant: variant_for(other_org, sku: "SKU-X")) }.to raise_error(ArgumentError, /variant/)

      expect(InventoryMovement.where(org_id: org.id).count).to eq(0)
      expect(InventorySnapshot.where(org_id: org.id).count).to eq(0)
    end

    it "rejects a location from another org" do
      foreign_location = Location.create!(org_id: other_org.id, name: "Shop", type: "shop")

      expect { adjust!("5", location: foreign_location) }.to raise_error(ArgumentError, /location/i)
    end
  end

  describe Inventory::OnHand do
    it "derives on-hand from the ledger, per location and in total" do
      adjust!("5")
      adjust!("-2")
      adjust!("7", location: warehouse)

      expect(described_class.for(org_id: org.id, variant_id: variant.id)).to eq(10.to_d)
      expect(described_class.for(org_id: org.id, variant_id: variant.id, location_id: shop.id)).to eq(3.to_d)
      expect(described_class.by_location(org_id: org.id, variant_id: variant.id)).to eq(
        shop.id => 3.to_d,
        warehouse.id => 7.to_d
      )
    end

    it "is zero for a variant that has never moved" do
      expect(described_class.for(org_id: org.id, variant_id: variant.id)).to eq(0.to_d)
    end

    it "does not leak across orgs" do
      adjust!("5")

      expect(described_class.for(org_id: other_org.id, variant_id: variant.id)).to eq(0.to_d)
    end
  end

  describe Inventory::RebuildSnapshots do
    it "makes every snapshot equal the ledger sum" do
      adjust!("5")
      adjust!("-2")
      adjust!("7", location: warehouse)

      described_class.call(org_id: org.id)

      InventorySnapshot.where(org_id: org.id).find_each do |snapshot|
        expect(snapshot.quantity).to eq(
          Inventory::OnHand.for(org_id: org.id, variant_id: snapshot.variant_id, location_id: snapshot.location_id)
        )
      end
    end

    it "repairs drift between the cache and the ledger" do
      adjust!("5")
      InventorySnapshot.where(org_id: org.id).update_all(quantity: 999)

      expect(described_class.call(org_id: org.id)).to eq(1)
      expect(
        InventorySnapshot.find_by(org_id: org.id, variant_id: variant.id, location_id: shop.id).quantity
      ).to eq(5.to_d)
    end

    it "drops snapshots that no longer have any movements" do
      InventorySnapshot.create!(org_id: org.id, variant_id: variant.id, location_id: shop.id, quantity: 42)

      described_class.call(org_id: org.id)

      expect(InventorySnapshot.where(org_id: org.id).count).to eq(0)
    end
  end
end
