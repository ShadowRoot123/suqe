import { Platform } from "react-native";

import { cartClear, cartLoad, cartSave } from "@/sales/cart";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";

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

function line(overrides: Record<string, unknown> = {}) {
  return {
    variant_id: VARIANT,
    sku: "COLA-330",
    product_name: "Cola",
    quantity: "2",
    unit_price: "5.00",
    ...overrides,
  } as any;
}

/**
 * A finalised sale is durable because it is a row in `sales`. This covers the other half: the
 * basket a cashier has started but not charged, which was React state until Sprint F Day 3 —
 * closing the app between the second and third item meant re-scanning with a queue watching.
 */
describe("held cart (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("survives a restart with its lines and its location", async () => {
    await cartSave({ location_id: LOCATION, lines: [line()] });

    const held = await cartLoad();
    expect(held?.location_id).toBe(LOCATION);
    expect(held?.lines).toEqual([
      {
        variant_id: VARIANT,
        sku: "COLA-330",
        product_name: "Cola",
        quantity: "2",
        unit_price: "5.00",
        discount: "",
        tax: "",
      },
    ]);
    expect(held?.updated_at).toBeTruthy();
  });

  // What was negotiated on a line is part of the basket: restoring the items but not the discount
  // would quietly charge the customer full price after a restart.
  test("keeps the discount and tax that were entered on a line", async () => {
    await cartSave({ location_id: LOCATION, lines: [line({ discount: "1.50", tax: "0.25" })] });

    const held = await cartLoad();
    expect(held?.lines[0]).toMatchObject({ discount: "1.50", tax: "0.25" });
  });

  // A restored basket should look like the one that was left. Every line carrying a "0.00"
  // discount reads as though someone typed it.
  test("an untouched discount comes back as an empty box, not as 0.00", async () => {
    await cartSave({ location_id: LOCATION, lines: [line({ discount: "0", tax: "nonsense" })] });

    const held = await cartLoad();
    expect(held?.lines[0]).toMatchObject({ discount: "", tax: "" });
  });

  // Restoring the items but selling them from somewhere else would take stock out of the wrong shop.
  test("remembers which location the basket was rung up at", async () => {
    await cartSave({ location_id: LOCATION, lines: [line()] });
    expect((await cartLoad())?.location_id).toBe(LOCATION);
  });

  test("emptying the cart clears the held copy rather than restoring a blank one", async () => {
    await cartSave({ location_id: LOCATION, lines: [line()] });
    await cartSave({ location_id: LOCATION, lines: [] });

    expect(await cartLoad()).toBeNull();
  });

  test("charging clears it", async () => {
    await cartSave({ location_id: LOCATION, lines: [line()] });
    await cartClear();

    expect(await cartLoad()).toBeNull();
  });

  test("nothing held reads as nothing, not a crash", async () => {
    expect(await cartLoad()).toBeNull();
  });

  test("malformed state degrades to no held cart instead of breaking the till", async () => {
    globalThis.localStorage.setItem("myshop.kv.pos_cart_v1", "not json");
    expect(await cartLoad()).toBeNull();

    globalThis.localStorage.setItem("myshop.kv.pos_cart_v1", JSON.stringify({ lines: "nope" }));
    expect(await cartLoad()).toBeNull();

    // A line with no variant cannot be sold, so it is dropped; a cart of only those is no cart.
    globalThis.localStorage.setItem("myshop.kv.pos_cart_v1", JSON.stringify({ lines: [{ sku: "X" }] }));
    expect(await cartLoad()).toBeNull();
  });

  test("a quantity that is not a number comes back as one rather than poisoning the totals", async () => {
    await cartSave({ location_id: LOCATION, lines: [line({ quantity: "oops" })] });
    expect((await cartLoad())?.lines[0].quantity).toBe("1");
  });

  /**
   * The bug this guards against: the screen's save effect firing on its first render — before the
   * held cart has been read — would write an empty basket over the one it was about to restore.
   * The screen holds a `hydrated` flag for exactly this; here we prove the store itself does not
   * quietly treat an unread cart as an empty one.
   */
  test("reading does not disturb what is held", async () => {
    await cartSave({ location_id: LOCATION, lines: [line()] });

    await cartLoad();
    await cartLoad();

    expect((await cartLoad())?.lines).toHaveLength(1);
  });
});
