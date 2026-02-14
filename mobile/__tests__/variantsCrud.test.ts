import { Platform } from "react-native";

import { variantsGetById, variantsListByProduct } from "@/catalog/variants";
import { createVariantOffline, deleteVariantOffline, updateVariantOffline } from "@/sync/syncEngine";

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

describe("variants CRUD (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("create/update/delete variant offline updates local store", async () => {
    const productId = "p1";
    const id = await createVariantOffline({
      product_id: productId,
      sku: "SKU-1",
      barcode: "123",
      price: "10.50",
      cost_price: "7.25",
    });

    const created = await variantsGetById(id);
    expect(created?.sku).toBe("SKU-1");

    await updateVariantOffline({
      id,
      sku: "SKU-1A",
      barcode: null,
      price: "11.00",
    });

    const updated = await variantsGetById(id);
    expect(updated?.sku).toBe("SKU-1A");
    expect(updated?.barcode).toBeNull();
    expect(updated?.price).toBe("11.00");

    const list = await variantsListByProduct(productId);
    expect(list.map((v) => v.id)).toContain(id);

    await deleteVariantOffline(id);
    expect(await variantsGetById(id)).toBeNull();
  });
});

