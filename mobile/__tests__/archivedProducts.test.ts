import { Platform } from "react-native";

import { productsUpsert } from "@/catalog/products";
import { variantsSearch, variantsUpsert } from "@/catalog/variants";

function makeMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe("archived products in search (web mode)", () => {
  beforeEach(async () => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();

    await productsUpsert({ id: "p-active", name: "Cola Classic", status: "active" });
    await productsUpsert({ id: "p-archived", name: "Cola Discontinued", status: "archived" });

    await variantsUpsert({ id: "v-active", product_id: "p-active", sku: "COLA-330" });
    await variantsUpsert({ id: "v-archived", product_id: "p-archived", sku: "COLA-500" });
    // A variant whose product row has not synced to this device yet.
    await variantsUpsert({ id: "v-orphan", product_id: "p-missing", sku: "COLA-1000" });
  });

  test("search hides variants of archived products by default", async () => {
    const hits = await variantsSearch("COLA");
    expect(hits.map((h) => h.id).sort()).toEqual(["v-active", "v-orphan"]);
  });

  test("includeArchived brings them back, flagged", async () => {
    const hits = await variantsSearch("COLA", 20, { includeArchived: true });
    expect(hits.map((h) => h.id).sort()).toEqual(["v-active", "v-archived", "v-orphan"]);

    const archived = hits.find((h) => h.id === "v-archived");
    expect(archived?.product_status).toBe("archived");
    expect(archived?.product_name).toBe("Cola Discontinued");
  });

  test("a variant whose product is missing locally stays findable", async () => {
    const hits = await variantsSearch("COLA-1000");
    expect(hits.map((h) => h.id)).toEqual(["v-orphan"]);
    expect(hits[0].product_status).toBeNull();
  });

  test("matching by product name still works for active products", async () => {
    const hits = await variantsSearch("Classic");
    expect(hits.map((h) => h.id)).toEqual(["v-active"]);
  });
});
