import { Platform } from "react-native";

import { thresholdsFindTarget, thresholdsList, thresholdsUpsert } from "@/inventory/thresholds";
import { outboxUnsettledEntityIds } from "@/sync/outbox";
import { deleteStockThresholdOffline, setStockThresholdOffline } from "@/sync/syncEngine";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const SHOP = "22222222-2222-4222-8222-222222222222";

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

function readOutbox(): { entity: string; operation: string; payload: string; status: string }[] {
  return JSON.parse(globalThis.localStorage.getItem("myshop.outbox.v1") ?? "[]");
}

function payloads() {
  return readOutbox().map((r) => ({ operation: r.operation, payload: JSON.parse(r.payload) }));
}

describe("stock thresholds CRUD (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("set writes locally and queues one create", async () => {
    const id = await setStockThresholdOffline({
      variant_id: VARIANT,
      location_id: SHOP,
      reorder_point: "12.5",
      reorder_quantity: "50",
    });

    const row = await thresholdsFindTarget(VARIANT, SHOP);
    expect(row?.id).toBe(id);
    expect(row?.reorder_point).toBe("12.5");
    expect(row?.reorder_quantity).toBe("50");

    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0].entity).toBe("stock_threshold");
    expect(payloads()[0]).toEqual({
      operation: "create",
      payload: { id, variant_id: VARIANT, location_id: SHOP, reorder_point: "12.5", reorder_quantity: "50" },
    });
  });

  test("no location means the variant-wide default, which coexists with a per-location row", async () => {
    const defaultId = await setStockThresholdOffline({ variant_id: VARIANT, reorder_point: "5" });
    const shopId = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "20" });

    expect(defaultId).not.toBe(shopId);
    expect(await thresholdsList()).toHaveLength(2);
    expect((await thresholdsFindTarget(VARIANT, null))?.location_id).toBeNull();
    expect((await thresholdsFindTarget(VARIANT, SHOP))?.reorder_point).toBe("20");
  });

  test("setting the same target again edits that row instead of adding a second one", async () => {
    const id = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "10" });
    const again = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "4" });

    expect(again).toBe(id);
    expect(await thresholdsList()).toHaveLength(1);
    expect((await thresholdsFindTarget(VARIANT, SHOP))?.reorder_point).toBe("4");
    expect(payloads().map((p) => p.operation)).toEqual(["create", "update"]);
  });

  // The server only touches the keys a command names, so an omitted reorder_quantity would leave
  // the old one in place — clearing it has to be explicit.
  test("clearing the reorder quantity sends it as null rather than omitting it", async () => {
    const id = await setStockThresholdOffline({
      variant_id: VARIANT,
      location_id: SHOP,
      reorder_point: "10",
      reorder_quantity: "40",
    });
    await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "10" });

    expect((await thresholdsFindTarget(VARIANT, SHOP))?.reorder_quantity).toBeNull();
    expect(payloads()[1]).toEqual({
      operation: "update",
      payload: { id, reorder_point: "10", reorder_quantity: null },
    });
  });

  test("a reorder point of zero is accepted — it means 'tell me when this runs out'", async () => {
    await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "0" });

    expect((await thresholdsFindTarget(VARIANT, SHOP))?.reorder_point).toBe("0");
  });

  test("bad input is refused before anything is queued", async () => {
    await expect(setStockThresholdOffline({ variant_id: VARIANT, reorder_point: "abc" })).rejects.toThrow(
      "Reorder point must be a number"
    );
    await expect(setStockThresholdOffline({ variant_id: VARIANT, reorder_point: "-1" })).rejects.toThrow(
      "must not be negative"
    );
    await expect(
      setStockThresholdOffline({ variant_id: VARIANT, reorder_point: "5", reorder_quantity: "0" })
    ).rejects.toThrow("greater than zero");
    await expect(
      setStockThresholdOffline({ variant_id: VARIANT, reorder_point: "5", reorder_quantity: "nope" })
    ).rejects.toThrow("Reorder quantity must be a number");

    expect(readOutbox()).toHaveLength(0);
    expect(await thresholdsList()).toHaveLength(0);
  });

  test("delete removes the row optimistically and queues the command", async () => {
    const id = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "10" });

    await deleteStockThresholdOffline(id);

    expect(await thresholdsFindTarget(VARIANT, SHOP)).toBeNull();
    expect(payloads().map((p) => p.operation)).toEqual(["create", "delete"]);
  });

  // Two devices can each create a threshold for the same target; the server resolves them onto one
  // row, so the loser's id arrives through the pull feed as a stale duplicate.
  test("a pulled row replaces a local one aimed at the same target", async () => {
    const localId = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "10" });

    await thresholdsUpsert({
      id: "33333333-3333-4333-8333-333333333333",
      variant_id: VARIANT,
      location_id: SHOP,
      reorder_point: "7",
    });

    const rows = await thresholdsList();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(localId);
    expect(rows[0].reorder_point).toBe("7");
  });

  test("ids with unacknowledged commands are reported so a REST refresh cannot overwrite them", async () => {
    const id = await setStockThresholdOffline({ variant_id: VARIANT, location_id: SHOP, reorder_point: "10" });

    expect(await outboxUnsettledEntityIds("stock_threshold")).toEqual(new Set([id]));

    const rows = readOutbox();
    rows.forEach((r) => {
      r.status = "applied";
    });
    globalThis.localStorage.setItem("myshop.outbox.v1", JSON.stringify(rows));

    expect(await outboxUnsettledEntityIds("stock_threshold")).toEqual(new Set());
  });
});
