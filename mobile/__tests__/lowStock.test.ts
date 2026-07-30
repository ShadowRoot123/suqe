import {
  effectiveThreshold,
  indexThresholds,
  lowStockFor,
  thresholdTargetsWithoutStock,
  type ThresholdLike,
} from "@/inventory/lib/lowStock";
import { cellKey, foldOnHand } from "@/inventory/lib/onHand";

const SHOP = "loc-shop";
const WAREHOUSE = "loc-warehouse";
const VARIANT = "var-1";

function threshold(overrides: Partial<ThresholdLike> = {}): ThresholdLike {
  return {
    id: "thr-1",
    variant_id: VARIANT,
    location_id: null,
    reorder_point: "5",
    reorder_quantity: null,
    ...overrides,
  };
}

describe("low-stock resolution", () => {
  test("a row naming the location beats the variant-wide default", () => {
    const index = indexThresholds([
      threshold({ id: "default", reorder_point: "5" }),
      threshold({ id: "shop", location_id: SHOP, reorder_point: "20" }),
    ]);

    expect(effectiveThreshold(index, VARIANT, SHOP)).toMatchObject({ id: "shop", reorder_point: 20, source: "location" });
    expect(effectiveThreshold(index, VARIANT, WAREHOUSE)).toMatchObject({
      id: "default",
      reorder_point: 5,
      source: "default",
    });
  });

  test("no threshold means no verdict, however low the stock is", () => {
    const index = indexThresholds([]);

    expect(effectiveThreshold(index, VARIANT, SHOP)).toBeNull();
    expect(lowStockFor(index, VARIANT, SHOP, -4)).toBeNull();
  });

  // An unset threshold is not a threshold of zero, but a threshold *of* zero is real: it says
  // "tell me when this runs out".
  test("a reorder point of zero is a real threshold", () => {
    const index = indexThresholds([threshold({ reorder_point: "0" })]);

    expect(lowStockFor(index, VARIANT, SHOP, 2)?.low).toBe(false);
    expect(lowStockFor(index, VARIANT, SHOP, 0)).toMatchObject({ low: true, shortfall: 0 });
  });

  test("sitting exactly on the reorder point counts as low", () => {
    const index = indexThresholds([threshold({ reorder_point: "5" })]);

    expect(lowStockFor(index, VARIANT, SHOP, 5)).toMatchObject({ low: true, shortfall: 0 });
    expect(lowStockFor(index, VARIANT, SHOP, 5.001)?.low).toBe(false);
  });

  test("shortfall measures how far below the point stock has fallen", () => {
    const index = indexThresholds([threshold({ reorder_point: "10", reorder_quantity: "40" })]);

    expect(lowStockFor(index, VARIANT, SHOP, 1.5)).toMatchObject({
      low: true,
      shortfall: 8.5,
      reorder_quantity: 40,
    });
    // Above the point there is nothing to make up.
    expect(lowStockFor(index, VARIANT, SHOP, 12)).toMatchObject({ low: false, shortfall: 0 });
  });

  test("a variant-wide default applies at a location with no row of its own", () => {
    const index = indexThresholds([threshold({ reorder_point: "5" })]);

    expect(lowStockFor(index, VARIANT, WAREHOUSE, 1)).toMatchObject({ low: true, source: "default" });
  });

  test("the default is not used when the location has its own row, even a higher one", () => {
    const index = indexThresholds([
      threshold({ id: "default", reorder_point: "50" }),
      threshold({ id: "shop", location_id: SHOP, reorder_point: "1" }),
    ]);

    expect(lowStockFor(index, VARIANT, SHOP, 5)).toMatchObject({ low: false, source: "location" });
  });

  // The whole point of caching reorder points locally: an adjustment made offline has to raise the
  // alert immediately, off the same folded on-hand the list shows, without waiting for a sync.
  describe("against on-hand folded from the local ledger", () => {
    const index = indexThresholds([threshold({ location_id: SHOP, reorder_point: "10" })]);

    function verdict(pending: { quantity_delta: string }[]) {
      const cells = foldOnHand([{ variant_id: VARIANT, location_id: SHOP, quantity: "12" }], pending.map((p) => ({ variant_id: VARIANT, location_id: SHOP, quantity_delta: p.quantity_delta })));
      const cell = cells.get(cellKey(VARIANT, SHOP))!;
      return lowStockFor(index, VARIANT, SHOP, cell.quantity);
    }

    test("a synced snapshot above the point is not low", () => {
      expect(verdict([])).toMatchObject({ low: false, on_hand: 12 });
    });

    test("an unsynced adjustment that crosses the point raises the alert", () => {
      expect(verdict([{ quantity_delta: "-3" }])).toMatchObject({ low: true, on_hand: 9, shortfall: 1 });
    });

    test("an unsynced adjustment that restocks past the point clears it", () => {
      expect(verdict([{ quantity_delta: "-3" }, { quantity_delta: "5" }])).toMatchObject({ low: false, on_hand: 14 });
    });
  });

  describe("targets with no stock history", () => {
    test("a location-specific threshold earns a row so 'we have none' can be shown", () => {
      const index = indexThresholds([threshold({ id: "shop", location_id: SHOP, reorder_point: "3" })]);

      expect(thresholdTargetsWithoutStock(index, () => false)).toEqual([{ variant_id: VARIANT, location_id: SHOP }]);
    });

    test("nothing is invented when a cell already exists", () => {
      const index = indexThresholds([threshold({ id: "shop", location_id: SHOP, reorder_point: "3" })]);

      expect(thresholdTargetsWithoutStock(index, () => true)).toEqual([]);
    });

    // Otherwise every variant with a default would be crossed with every location the org opened.
    test("a variant-wide default never invents a row", () => {
      const index = indexThresholds([threshold({ reorder_point: "3" })]);

      expect(thresholdTargetsWithoutStock(index, () => false)).toEqual([]);
    });
  });
});
