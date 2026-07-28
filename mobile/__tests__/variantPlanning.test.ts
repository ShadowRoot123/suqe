import { planVariantGeneration, skuSlug } from "@/features/productGroups/lib/variantPlanning";

describe("skuSlug", () => {
  it("uppercases and replaces non-alphanumerics with dashes", () => {
    expect(skuSlug("Classic T-Shirt")).toBe("CLASSIC-T-SHIRT");
    expect(skuSlug("  café  ")).toBe("CAFE");
    expect(skuSlug("100% cotton!")).toBe("100-COTTON");
  });
});

describe("planVariantGeneration", () => {
  it("creates one variant per combination with slugged SKUs", () => {
    const planned = planVariantGeneration({
      productName: "T-Shirt",
      variantOptions: { Size: ["S", "M"], Color: ["Red"] },
      existing: [],
    });

    expect(planned).toHaveLength(2);
    const skus = planned.map((p) => p.sku).sort();
    expect(skus).toEqual(["T-SHIRT-RED-M", "T-SHIRT-RED-S"]);
    expect(planned.map((p) => p.attrs)).toEqual(
      expect.arrayContaining([
        { Size: "S", Color: "Red" },
        { Size: "M", Color: "Red" },
      ])
    );
  });

  it("skips combinations that already exist (case-insensitive attrs match)", () => {
    const planned = planVariantGeneration({
      productName: "T-Shirt",
      variantOptions: { Size: ["S", "M"] },
      existing: [{ sku: "OLD-SKU", attrs_json: JSON.stringify({ size: "s" }) }],
    });

    expect(planned).toHaveLength(1);
    expect(planned[0].attrs).toEqual({ Size: "M" });
  });

  it("dedupes SKU collisions with a numeric suffix", () => {
    const planned = planVariantGeneration({
      productName: "T-Shirt",
      variantOptions: { Size: ["M"] },
      existing: [{ sku: "T-SHIRT-M", attrs_json: "{}" }],
    });

    expect(planned).toHaveLength(1);
    expect(planned[0].sku).toBe("T-SHIRT-M-2");
  });

  it("returns empty when there are no usable options", () => {
    expect(
      planVariantGeneration({ productName: "X", variantOptions: {}, existing: [] })
    ).toEqual([]);
    expect(
      planVariantGeneration({ productName: "X", variantOptions: { Size: ["", "  "] }, existing: [] })
    ).toEqual([]);
  });

  it("ignores malformed existing attrs_json", () => {
    const planned = planVariantGeneration({
      productName: "Mug",
      variantOptions: { Color: ["Blue"] },
      existing: [{ sku: "MUG-X", attrs_json: "not json" }],
    });

    expect(planned).toHaveLength(1);
    expect(planned[0].sku).toBe("MUG-BLUE");
  });
});
