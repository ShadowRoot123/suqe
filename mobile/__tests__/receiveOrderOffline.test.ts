import { Platform } from "react-native";

import { movementsListUnsynced } from "@/inventory/movements";
import { ordersGetById, ordersUpsert } from "@/purchasing/orders";
import { parseReceiptLines, receiptsListForOrder } from "@/purchasing/receipts";
import { receiveOrderOffline, transitionPurchaseOrderOffline } from "@/sync/syncEngine";

const SUPPLIER = "11111111-1111-4111-8111-111111111111";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const VARIANT = "33333333-3333-4333-8333-333333333333";
const OTHER_VARIANT = "44444444-4444-4444-8444-444444444444";
const ORDER = "55555555-5555-4555-8555-555555555555";

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

function payloads() {
  const rows: { entity: string; operation: string; payload: string }[] = JSON.parse(
    globalThis.localStorage.getItem("myshop.outbox.v1") ?? "[]"
  );
  return rows.map((r) => ({ entity: r.entity, operation: r.operation, payload: JSON.parse(r.payload) }));
}

async function seedApprovedOrder(items = [{ variant_id: VARIANT, quantity_ordered: "10", unit_cost: "2.50" }]) {
  await ordersUpsert({
    id: ORDER,
    supplier_id: SUPPLIER,
    location_id: LOCATION,
    status: "approved",
    items,
    updated_at: new Date().toISOString(),
  });
  return ORDER;
}

describe("receiving goods offline (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("books the delivery in, moves stock locally and queues one command", async () => {
    await seedApprovedOrder();

    const id = await receiveOrderOffline({
      purchase_order_id: ORDER,
      items: [{ variant_id: VARIANT, quantity_received: "10" }],
    });

    const receipts = await receiptsListForOrder(ORDER);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].id).toBe(id);
    // Unsynced, but it still counts towards what has been received.
    expect(receipts[0].synced).toBe(0);
    expect(receipts[0].items[0].quantity_received).toBe("10");

    // On-hand rises immediately, exactly as an offline adjustment does.
    const movements = await movementsListUnsynced();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      variant_id: VARIANT,
      location_id: LOCATION,
      type: "purchase",
      quantity_delta: "10",
      synced: 0,
    });
    // The movement takes its receipt line's id, which is how a refused receipt finds it again.
    expect(movements[0].id).toBe(receipts[0].items[0].id);

    const queued = payloads();
    expect(queued).toHaveLength(1);
    expect(queued[0].entity).toBe("purchase_receipt");
    expect(queued[0].operation).toBe("create");
    expect(queued[0].payload.purchase_order_id).toBe(ORDER);
    expect(queued[0].payload.items).toHaveLength(1);
  });

  test("the order's status follows the goods", async () => {
    await seedApprovedOrder();

    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "4" }] });
    expect((await ordersGetById(ORDER))?.status).toBe("partially_received");

    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "6" }] });
    expect((await ordersGetById(ORDER))?.status).toBe("received");
  });

  test("a second receipt counts what the first already booked in", async () => {
    await seedApprovedOrder();
    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "7" }] });

    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "4" }] })
    ).rejects.toThrow(/3 outstanding/);

    // Nothing extra queued, and the stock did not move again.
    expect(payloads()).toHaveLength(1);
    expect(await movementsListUnsynced()).toHaveLength(1);
  });

  test("a line that names no cost is received at the cost it was ordered at", async () => {
    await seedApprovedOrder();

    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "1" }] });

    const [receipt] = await receiptsListForOrder(ORDER);
    expect(receipt.items[0].unit_cost).toBe("2.50");
  });

  test("a line can name what the delivery actually cost", async () => {
    await seedApprovedOrder();

    await receiveOrderOffline({
      purchase_order_id: ORDER,
      items: [{ variant_id: VARIANT, quantity_received: "1", unit_cost: "3.10" }],
    });

    const [receipt] = await receiptsListForOrder(ORDER);
    expect(receipt.items[0].unit_cost).toBe("3.10");
  });

  test("receiving against a draft is refused locally, with nothing queued", async () => {
    await ordersUpsert({
      id: ORDER,
      supplier_id: SUPPLIER,
      location_id: LOCATION,
      status: "draft",
      items: [{ variant_id: VARIANT, quantity_ordered: "5", unit_cost: "1" }],
      updated_at: new Date().toISOString(),
    });

    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "1" }] })
    ).rejects.toThrow("Cannot receive against a purchase order that is draft");

    expect(payloads()).toHaveLength(0);
    expect(await receiptsListForOrder(ORDER)).toHaveLength(0);
    expect(await movementsListUnsynced()).toHaveLength(0);
  });

  test("an over-receipt is refused before anything is written", async () => {
    await seedApprovedOrder();

    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "11" }] })
    ).rejects.toThrow(/Cannot receive more than ordered/);

    expect(payloads()).toHaveLength(0);
    expect(await movementsListUnsynced()).toHaveLength(0);
    expect((await ordersGetById(ORDER))?.status).toBe("approved");
  });

  test("a variant nobody ordered is refused", async () => {
    await seedApprovedOrder();

    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: OTHER_VARIANT, quantity_received: "1" }] })
    ).rejects.toThrow(/is not on this purchase order/);
    expect(payloads()).toHaveLength(0);
  });

  test("a short delivery leaves the rest outstanding across two lines", async () => {
    await seedApprovedOrder([
      { variant_id: VARIANT, quantity_ordered: "10", unit_cost: "2.50" },
      { variant_id: OTHER_VARIANT, quantity_ordered: "4", unit_cost: "1.00" },
    ]);

    await receiveOrderOffline({
      purchase_order_id: ORDER,
      items: [
        { variant_id: VARIANT, quantity_received: "10" },
        { variant_id: OTHER_VARIANT, quantity_received: "1" },
      ],
    });

    // One movement per line, both against the order's delivery location.
    const movements = await movementsListUnsynced();
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.location_id === LOCATION && m.type === "purchase")).toBe(true);
    expect((await ordersGetById(ORDER))?.status).toBe("partially_received");
  });

  /**
   * The whole point of the outstanding calculation: the last delivery closes the order out, and
   * a device that then tries to receive again has nothing left to book in.
   */
  test("the final delivery completes the order and nothing can be received after it", async () => {
    await seedApprovedOrder();
    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "6" }] });

    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "4" }] });
    expect((await ordersGetById(ORDER))?.status).toBe("received");

    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "1" }] })
    ).rejects.toThrow("Cannot receive against a purchase order that is received");
    expect(await receiptsListForOrder(ORDER)).toHaveLength(2);
  });

  /**
   * A short delivery is short-closed rather than cancelled: the ledger holds movements a status
   * change cannot undo. Closing stays an operator's decision, so it is a normal transition.
   */
  test("a partly delivered order can be short-closed", async () => {
    await seedApprovedOrder();
    await receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "3" }] });

    await transitionPurchaseOrderOffline({ id: ORDER, status: "closed" });

    expect((await ordersGetById(ORDER))?.status).toBe("closed");
    // Nothing more can be booked in against it.
    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "1" }] })
    ).rejects.toThrow("Cannot receive against a purchase order that is closed");
  });

  test("receiving an order this device has never seen is refused", async () => {
    await expect(
      receiveOrderOffline({ purchase_order_id: ORDER, items: [{ variant_id: VARIANT, quantity_received: "1" }] })
    ).rejects.toThrow("Purchase order not found");
  });

  test("malformed stored lines degrade to a receipt with no lines instead of crashing", () => {
    expect(parseReceiptLines("not json")).toEqual([]);
    expect(parseReceiptLines(undefined)).toEqual([]);
    expect(parseReceiptLines('[{"quantity_received":"1"}]')).toEqual([]);
    expect(parseReceiptLines(`[{"variant_id":"${VARIANT}","quantity_received":"2","unit_cost":"3"}]`)).toEqual([
      { id: VARIANT, variant_id: VARIANT, quantity_received: "2", unit_cost: "3.00" },
    ]);
  });
});
