import { Platform } from "react-native";

import { movementsListUnsynced } from "@/inventory/movements";
import { salesGetById } from "@/sales/sales";
import { createSaleOffline, voidSaleOffline } from "@/sync/syncEngine";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";
const OTHER_VARIANT = "33333333-3333-4333-8333-333333333333";
const CASHIER = "44444444-4444-4444-8444-444444444444";

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

/** What on-hand actually moves by: the snapshot cache plus every unacknowledged movement. */
async function unsyncedDelta(variantId = VARIANT) {
  const rows = await movementsListUnsynced();
  return rows.filter((m) => m.variant_id === variantId).reduce((sum, m) => sum + Number(m.quantity_delta), 0);
}

describe("voiding a sale offline (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("marks the sale voided, puts the stock back and queues one update command", async () => {
    const id = await sell();
    await voidSaleOffline({ id, reason: "Wrong item scanned", voided_by: CASHIER });

    const sale = await salesGetById(id);
    expect(sale?.status).toBe("voided");

    const restore = (await movementsListUnsynced()).find((m) => m.type === "adjustment");
    expect(restore).toMatchObject({
      variant_id: VARIANT,
      location_id: LOCATION,
      // The exact opposite of what the sale took out, and unsynced so on-hand climbs back now.
      quantity_delta: "2",
      note: "Wrong item scanned",
      synced: 0,
    });
    // Net zero: the goods went out and came back, and both halves are still in the ledger.
    expect(await unsyncedDelta()).toBe(0);

    const queued = payloads();
    expect(queued).toHaveLength(2);
    // A void rides `update` carrying only the status — the same idiom as a purchase order's
    // transitions. Any other update to a sale is refused by the server.
    expect(queued[1]).toMatchObject({ entity: "sale", operation: "update" });
    expect(queued[1].payload).toEqual({
      id,
      status: "voided",
      reason: "Wrong item scanned",
      voided_by: CASHIER,
    });
  });

  /**
   * The restore movements are keyed off the **sale**, not this device's line ids, because a void
   * queued behind an unsynced sale outlives them: folding the sale's own echo replaces the local
   * line ids with the server's. The prefix is what still finds them when the void's echo lands.
   */
  test("keys the restore movements off the sale so they can be found again after it syncs", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    const restore = (await movementsListUnsynced()).filter((m) => m.type === "adjustment");
    expect(restore).toHaveLength(1);
    expect(restore[0].id.startsWith(`sale_void:${id}:`)).toBe(true);
  });

  test("puts back every line, at the location the sale was rung up at", async () => {
    const id = await sell({
      location_id: LOCATION,
      items: [
        { variant_id: VARIANT, quantity: "2", unit_price: "5.00" },
        { variant_id: OTHER_VARIANT, quantity: "3", unit_price: "1.00" },
      ],
      payments: [{ method: "cash", amount: "13.00" }],
    });
    await voidSaleOffline({ id });

    const restore = (await movementsListUnsynced()).filter((m) => m.type === "adjustment");
    expect(restore).toHaveLength(2);
    expect(restore.every((m) => m.location_id === LOCATION)).toBe(true);
    expect(restore.map((m) => m.quantity_delta).sort()).toEqual(["2", "3"]);
    expect(await unsyncedDelta(OTHER_VARIANT)).toBe(0);
  });

  /**
   * Nothing is deleted. The sale keeps its lines, its totals and its payments — a receipt for a
   * voided sale still has to render, and the money that was taken still has to be visible.
   */
  test("leaves the sale itself intact", async () => {
    const id = await sell({
      items: [{ variant_id: VARIANT, quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50" }],
      payments: [{ method: "cash", amount: "9.50" }],
    });
    await voidSaleOffline({ id });

    const sale = await salesGetById(id);
    expect(sale?.total_amount).toBe("9.50");
    expect(sale?.discount).toBe("1.00");
    expect(sale?.tax).toBe("0.50");
    expect(sale?.items).toHaveLength(1);
    expect(sale?.payments).toHaveLength(1);
  });

  // The caller asked for a state the sale is in, and it is. The server replays a void the same
  // way, so a second command would be harmless — but the stock is already back on this device.
  test("voiding twice does not put the stock back twice", async () => {
    const id = await sell();
    await voidSaleOffline({ id });
    await voidSaleOffline({ id });

    expect((await movementsListUnsynced()).filter((m) => m.type === "adjustment")).toHaveLength(1);
    expect(await unsyncedDelta()).toBe(0);
    expect(payloads().filter((p) => p.operation === "update")).toHaveLength(1);
  });

  test("a sale this device has never seen cannot be voided", async () => {
    await expect(voidSaleOffline({ id: "99999999-9999-4999-8999-999999999999" })).rejects.toThrow(
      "This sale is not on this device."
    );
    expect(payloads()).toHaveLength(0);
  });

  // A void queued behind an unsynced sale is legitimate: the server applies the create, then the
  // void, in the order they were enqueued.
  test("an unsynced sale can be voided, and both commands queue in order", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    const sale = await salesGetById(id);
    expect(sale?.synced).toBe(0);
    expect(sale?.status).toBe("voided");
    expect(payloads().map((p) => p.operation)).toEqual(["create", "update"]);
  });

  test("an empty reason is not stored as one", async () => {
    const id = await sell();
    await voidSaleOffline({ id, reason: "   " });

    expect(payloads()[1].payload.reason).toBeNull();
    expect((await movementsListUnsynced()).find((m) => m.type === "adjustment")?.note).toBe("Sale voided");
  });
});
