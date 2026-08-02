import { Platform } from "react-native";

import { movementsListUnsynced } from "@/inventory/movements";
import { parseSaleLines, parseSalePayments, salesGetById, salesList } from "@/sales/sales";
import { createSaleOffline } from "@/sync/syncEngine";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";
const OTHER_VARIANT = "33333333-3333-4333-8333-333333333333";

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

function sell(overrides: Record<string, unknown> = {}) {
  return createSaleOffline({
    location_id: LOCATION,
    items: [{ variant_id: VARIANT, quantity: "2", unit_price: "5.00" }],
    payments: [{ method: "cash", amount: "10.00" }],
    ...overrides,
  } as any);
}

describe("selling offline (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("records the sale, takes the stock out and queues one command", async () => {
    const id = await sell();

    const sale = await salesGetById(id);
    expect(sale?.status).toBe("completed");
    expect(sale?.total_amount).toBe("10.00");
    expect(sale?.items).toHaveLength(1);
    expect(sale?.payments).toHaveLength(1);
    // Unsynced, but the goods have left the shop.
    expect(sale?.synced).toBe(0);

    const movements = await movementsListUnsynced();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      variant_id: VARIANT,
      location_id: LOCATION,
      type: "sale",
      // Negative: stock leaves with the customer.
      quantity_delta: "-2",
      synced: 0,
    });
    // The movement takes its line's id, which is how a refused sale finds it again.
    expect(movements[0].id).toBe(sale?.items[0].id);

    const queued = payloads();
    expect(queued).toHaveLength(1);
    expect(queued[0].entity).toBe("sale");
    expect(queued[0].operation).toBe("create");
    expect(queued[0].payload.items).toHaveLength(1);
    expect(queued[0].payload.payments).toEqual([expect.objectContaining({ method: "cash", amount: "10.00" })]);
  });

  test("derives the totals rather than trusting whatever it was handed", async () => {
    const id = await sell({
      items: [
        { variant_id: VARIANT, quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50" },
        { variant_id: OTHER_VARIANT, quantity: "1", unit_price: "3.00", tax: "0.30" },
      ],
      payments: [{ method: "cash", amount: "12.80" }],
    });

    const sale = await salesGetById(id);
    expect(sale?.subtotal).toBe("13.00");
    expect(sale?.discount).toBe("1.00");
    expect(sale?.tax).toBe("0.80");
    expect(sale?.total_amount).toBe("12.80");
  });

  test("writes one movement per line", async () => {
    await sell({
      items: [
        { variant_id: VARIANT, quantity: "2", unit_price: "5.00" },
        { variant_id: OTHER_VARIANT, quantity: "1", unit_price: "3.00" },
      ],
      payments: [{ method: "cash", amount: "13.00" }],
    });

    const movements = await movementsListUnsynced();
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === "sale" && m.location_id === LOCATION)).toBe(true);
    expect(movements.map((m) => m.quantity_delta).sort()).toEqual(["-1", "-2"]);
  });

  test("refuses a sale whose payment does not add up, with nothing written", async () => {
    await expect(sell({ payments: [{ method: "cash", amount: "9.00" }] })).rejects.toThrow(
      "Payments must add up to the sale total: 10.00 due, 9.00 paid"
    );

    expect(payloads()).toHaveLength(0);
    expect(await salesList()).toHaveLength(0);
    expect(await movementsListUnsynced()).toHaveLength(0);
  });

  test("refuses an empty cart, a bad method and a bad line before anything is queued", async () => {
    await expect(sell({ items: [] })).rejects.toThrow(/needs at least one line/);
    await expect(sell({ payments: [{ method: "iou", amount: "10.00" }] })).rejects.toThrow(/Invalid payment method/);
    await expect(
      sell({ items: [{ variant_id: VARIANT, quantity: "0", unit_price: "5.00" }] })
    ).rejects.toThrow(/quantity must be greater than zero/);

    expect(payloads()).toHaveLength(0);
    expect(await movementsListUnsynced()).toHaveLength(0);
  });

  test("needs somewhere to sell from", async () => {
    await expect(sell({ location_id: "" })).rejects.toThrow("Choose a location to sell from");
  });

  test("keeps a history the till can read back, newest first", async () => {
    await sell({ sold_at: "2026-08-01T09:00:00.000Z" });
    await sell({ sold_at: "2026-08-01T11:00:00.000Z" });

    const rows = await salesList();
    expect(rows).toHaveLength(2);
    expect(rows[0].sold_at).toBe("2026-08-01T11:00:00.000Z");
  });

  test("malformed stored lines and payments degrade instead of crashing the receipt", () => {
    expect(parseSaleLines("not json")).toEqual([]);
    expect(parseSaleLines('[{"quantity":"1"}]')).toEqual([]);
    expect(parseSaleLines(`[{"variant_id":"${VARIANT}","quantity":"2","unit_price":"3"}]`)).toEqual([
      { id: VARIANT, variant_id: VARIANT, quantity: "2", unit_price: "3.00", discount: "0.00", tax: "0.00" },
    ]);

    // A method the server would refuse is dropped rather than rendered as if it had been paid.
    expect(parseSalePayments('[{"method":"iou","amount":"5"}]')).toEqual([]);
    expect(parseSalePayments('[{"method":"cash","amount":"5"}]')).toEqual([
      { id: "cash", method: "cash", amount: "5.00", reference: null },
    ]);
  });
});
