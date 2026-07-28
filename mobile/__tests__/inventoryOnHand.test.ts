import { cellKey, foldOnHand, totalForVariant } from "@/inventory/lib/onHand";
import { addQuantity, formatQuantity, parseDelta, parseQuantity } from "@/inventory/lib/quantity";

describe("quantity", () => {
  it("parses server decimals and rejects junk", () => {
    expect(parseQuantity("5.000")).toBe(5);
    expect(parseQuantity("-2.5")).toBe(-2.5);
    expect(parseQuantity(3)).toBe(3);
    expect(parseQuantity("lots")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity(Infinity)).toBeNull();
  });

  it("keeps repeated deltas at 3 decimal places instead of drifting", () => {
    expect(addQuantity(0.1, 0.2)).toBe(0.3);

    let total = 0;
    for (let i = 0; i < 10; i += 1) total = addQuantity(total, 0.1);
    expect(total).toBe(1);
  });

  it("formats without trailing noise", () => {
    expect(formatQuantity(5)).toBe("5");
    expect(formatQuantity(5.5)).toBe("5.5");
    expect(formatQuantity(-2.25)).toBe("-2.25");
  });

  it("rejects the deltas the server would reject", () => {
    expect(parseDelta("")).toEqual({ ok: false, error: "Enter a quantity" });
    expect(parseDelta("  ")).toEqual({ ok: false, error: "Enter a quantity" });
    expect(parseDelta("abc")).toEqual({ ok: false, error: "Quantity must be a number" });
    expect(parseDelta("0")).toEqual({ ok: false, error: "Quantity must not be zero" });
    expect(parseDelta(" -3 ")).toEqual({ ok: true, value: -3 });
  });
});

describe("foldOnHand", () => {
  const A = "variant-a";
  const B = "variant-b";
  const SHOP = "loc-shop";
  const WAREHOUSE = "loc-warehouse";

  it("adds unsynced local adjustments on top of the server snapshot", () => {
    const cells = foldOnHand(
      [{ variant_id: A, location_id: SHOP, quantity: "10" }],
      [
        { variant_id: A, location_id: SHOP, quantity_delta: "5" },
        { variant_id: A, location_id: SHOP, quantity_delta: "-2" },
      ]
    );

    const cell = cells.get(cellKey(A, SHOP))!;
    expect(cell.synced).toBe(10);
    expect(cell.pending).toBe(3);
    expect(cell.quantity).toBe(13);
  });

  it("shows stock for a location that has only unsynced movements", () => {
    const cells = foldOnHand([], [{ variant_id: B, location_id: WAREHOUSE, quantity_delta: "4" }]);

    const cell = cells.get(cellKey(B, WAREHOUSE))!;
    expect(cell.synced).toBe(0);
    expect(cell.quantity).toBe(4);
  });

  it("keeps locations separate", () => {
    const cells = foldOnHand(
      [
        { variant_id: A, location_id: SHOP, quantity: "10" },
        { variant_id: A, location_id: WAREHOUSE, quantity: "7" },
      ],
      [{ variant_id: A, location_id: SHOP, quantity_delta: "5" }]
    );

    expect(cells.get(cellKey(A, SHOP))!.quantity).toBe(15);
    expect(cells.get(cellKey(A, WAREHOUSE))!.quantity).toBe(7);
  });

  it("treats an unparseable quantity as zero rather than NaN", () => {
    const cells = foldOnHand(
      [{ variant_id: A, location_id: SHOP, quantity: "corrupt" }],
      [{ variant_id: A, location_id: SHOP, quantity_delta: "5" }]
    );

    expect(cells.get(cellKey(A, SHOP))!.quantity).toBe(5);
  });
});

describe("totalForVariant", () => {
  const A = "variant-a";
  const SHOP = "loc-shop";
  const WAREHOUSE = "loc-warehouse";

  const cells = foldOnHand(
    [
      { variant_id: A, location_id: SHOP, quantity: "10" },
      { variant_id: A, location_id: WAREHOUSE, quantity: "7" },
      { variant_id: "other", location_id: SHOP, quantity: "99" },
    ],
    [{ variant_id: A, location_id: SHOP, quantity_delta: "5" }]
  );

  it("totals every location for the variant", () => {
    expect(totalForVariant(cells, A)).toMatchObject({ synced: 17, pending: 5, quantity: 22 });
  });

  it("narrows to one location", () => {
    expect(totalForVariant(cells, A, WAREHOUSE)).toMatchObject({ synced: 7, pending: 0, quantity: 7 });
  });

  it("is zero for a variant with no stock anywhere", () => {
    expect(totalForVariant(cells, "unknown")).toMatchObject({ quantity: 0 });
  });
});
