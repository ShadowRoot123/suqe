import { Platform } from "react-native";

import { ordersGetById, ordersList, ordersUpsert, parseLines } from "@/purchasing/orders";
import {
  createPurchaseOrderOffline,
  deletePurchaseOrderOffline,
  transitionPurchaseOrderOffline,
  updatePurchaseOrderOffline,
} from "@/sync/syncEngine";

const SUPPLIER = "11111111-1111-4111-8111-111111111111";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const VARIANT = "33333333-3333-4333-8333-333333333333";
const OTHER_VARIANT = "44444444-4444-4444-8444-444444444444";

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

function line(overrides: Record<string, unknown> = {}) {
  return { variant_id: VARIANT, quantity_ordered: "2", unit_cost: "5.00", ...overrides };
}

async function createDraft(items: Record<string, unknown>[] = [line()]) {
  return await createPurchaseOrderOffline({ supplier_id: SUPPLIER, location_id: LOCATION, items: items as any });
}

describe("purchase orders CRUD (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("create writes a draft with a computed total and queues one create", async () => {
    const id = await createDraft([line({ quantity_ordered: "12", unit_cost: "2.50" })]);

    const order = await ordersGetById(id);
    expect(order?.status).toBe("draft");
    expect(order?.total_cost).toBe("30.00");
    expect(order?.items).toHaveLength(1);

    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0].entity).toBe("purchase_order");
    const queued = payloads()[0];
    expect(queued.operation).toBe("create");
    expect(queued.payload).toMatchObject({
      id,
      supplier_id: SUPPLIER,
      location_id: LOCATION,
      status: "draft",
      expected_at: null,
    });
    // The client owns line ids, which is what lets a later edit keep a surviving row's identity.
    expect(queued.payload.items[0].id).toBe(order?.items[0].id);
  });

  test("an order can start with no lines at all", async () => {
    const id = await createDraft([]);

    const order = await ordersGetById(id);
    expect(order?.items).toHaveLength(0);
    expect(order?.total_cost).toBe("0.00");
  });

  test("bad lines are refused before anything is queued", async () => {
    await expect(createDraft([line({ quantity_ordered: "0" })])).rejects.toThrow("greater than zero");
    await expect(createDraft([line({ quantity_ordered: "abc" })])).rejects.toThrow("Quantity must be a number");
    await expect(createDraft([line({ unit_cost: "-1" })])).rejects.toThrow("must not be negative");
    await expect(createDraft([line({ unit_cost: "nope" })])).rejects.toThrow("Unit cost must be a number");
    await expect(createDraft([line(), line()])).rejects.toThrow("same item is on two lines");

    expect(readOutbox()).toHaveLength(0);
    expect(await ordersList()).toHaveLength(0);
  });

  // Free goods are a real line; the server accepts a zero cost too.
  test("a line at no cost is allowed", async () => {
    const id = await createDraft([line({ unit_cost: "0" })]);

    expect((await ordersGetById(id))?.total_cost).toBe("0.00");
  });

  // Mirrors parse_time in process_pending.rb, which rejects anything that is not ISO 8601.
  test("the expected date must be ISO 8601, and a date on its own is fine", async () => {
    await expect(
      createPurchaseOrderOffline({ supplier_id: SUPPLIER, location_id: LOCATION, expected_at: "next tuesday-ish" })
    ).rejects.toThrow("Expected date must look like");
    expect(readOutbox()).toHaveLength(0);

    const id = await createPurchaseOrderOffline({
      supplier_id: SUPPLIER,
      location_id: LOCATION,
      expected_at: "2026-08-20",
    });
    expect((await ordersGetById(id))?.expected_at).toBe("2026-08-20");
  });

  test("a supplier and a location are both required", async () => {
    await expect(createPurchaseOrderOffline({ supplier_id: "", location_id: LOCATION })).rejects.toThrow("supplier");
    await expect(createPurchaseOrderOffline({ supplier_id: SUPPLIER, location_id: "" })).rejects.toThrow("location");
    expect(readOutbox()).toHaveLength(0);
  });

  test("editing a draft keeps surviving line ids, drops the rest and recomputes the total", async () => {
    const id = await createDraft([line({ quantity_ordered: "1", unit_cost: "5" }), line({ variant_id: OTHER_VARIANT })]);
    const before = await ordersGetById(id);
    const keptId = before!.items.find((i) => i.variant_id === VARIANT)!.id;

    await updatePurchaseOrderOffline({
      id,
      items: [{ id: keptId, variant_id: VARIANT, quantity_ordered: "4", unit_cost: "5" }],
    });

    const after = await ordersGetById(id);
    expect(after?.items).toHaveLength(1);
    expect(after?.items[0].id).toBe(keptId);
    expect(after?.total_cost).toBe("20.00");

    const queued = payloads()[1];
    expect(queued.operation).toBe("update");
    expect(queued.payload.items).toHaveLength(1);
  });

  test("an edit that does not mention the lines leaves them alone", async () => {
    const id = await createDraft();

    await updatePurchaseOrderOffline({ id, expected_at: "2026-09-01" });

    const order = await ordersGetById(id);
    expect(order?.items).toHaveLength(1);
    expect(order?.expected_at).toBe("2026-09-01");
    expect(order?.total_cost).toBe("10.00");
  });

  test("a draft moves to approved and queues a status-only command", async () => {
    const id = await createDraft();

    await transitionPurchaseOrderOffline({ id, status: "approved" });

    expect((await ordersGetById(id))?.status).toBe("approved");
    // A full payload would re-send the lines, and the server refuses line edits past draft — the
    // approval would fail on its own command.
    expect(payloads()[1]).toEqual({ operation: "update", payload: { id, status: "approved" } });
  });

  test("receiving against a draft is refused locally, with nothing queued", async () => {
    const id = await createDraft();

    await expect(transitionPurchaseOrderOffline({ id, status: "received" })).rejects.toThrow(
      "Cannot move a purchase order from draft to received"
    );

    expect((await ordersGetById(id))?.status).toBe("draft");
    expect(payloads()).toHaveLength(1);
  });

  test("approving an order with no lines is refused", async () => {
    const id = await createDraft([]);

    await expect(transitionPurchaseOrderOffline({ id, status: "approved" })).rejects.toThrow("at least one line");

    expect((await ordersGetById(id))?.status).toBe("draft");
    expect(payloads()).toHaveLength(1);
  });

  test("a terminal order cannot change status again", async () => {
    const id = await createDraft();
    await transitionPurchaseOrderOffline({ id, status: "cancelled" });

    await expect(transitionPurchaseOrderOffline({ id, status: "approved" })).rejects.toThrow(
      "Cannot change the status of a purchase order that is cancelled"
    );
  });

  test("asking for the status the order already has queues nothing", async () => {
    const id = await createDraft();
    await transitionPurchaseOrderOffline({ id, status: "approved" });

    await transitionPurchaseOrderOffline({ id, status: "approved" });

    expect(payloads()).toHaveLength(2);
  });

  test("an approved order can no longer be edited or deleted", async () => {
    const id = await createDraft();
    await transitionPurchaseOrderOffline({ id, status: "approved" });

    await expect(updatePurchaseOrderOffline({ id, items: [] })).rejects.toThrow(
      "Cannot edit a purchase order that is approved"
    );
    await expect(deletePurchaseOrderOffline(id)).rejects.toThrow("Cannot delete a purchase order that is approved");

    expect((await ordersGetById(id))?.items).toHaveLength(1);
    expect(payloads()).toHaveLength(2);
  });

  test("a draft can be deleted", async () => {
    const id = await createDraft();

    await deletePurchaseOrderOffline(id);

    expect(await ordersGetById(id)).toBeNull();
    expect(payloads().map((p) => p.operation)).toEqual(["create", "delete"]);
  });

  /**
   * What the pull feed folds in: the server's record is authoritative for the whole order, so a
   * duplicate create that resolved onto another row replaces the local copy rather than adding one.
   */
  test("a server record replaces the local order in place", async () => {
    const id = await createDraft([line({ quantity_ordered: "2", unit_cost: "5" })]);

    await ordersUpsert({
      id,
      supplier_id: SUPPLIER,
      location_id: LOCATION,
      status: "approved",
      total_cost: "99.0",
      items: [{ id: "server-line", variant_id: VARIANT, quantity_ordered: "9.0", unit_cost: "11.0" }],
      updated_at: new Date().toISOString(),
    });

    const rows = await ordersList();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("approved");
    // The server's own total wins — it recomputed it from the lines it actually stored.
    expect(rows[0].total_cost).toBe("99.00");
    expect(rows[0].items[0].unit_cost).toBe("11.00");
  });

  test("malformed stored lines degrade to an empty order instead of crashing", () => {
    expect(parseLines("not json")).toEqual([]);
    expect(parseLines(undefined)).toEqual([]);
    expect(parseLines('[{"quantity_ordered":"1"}]')).toEqual([]);
    expect(parseLines(`[{"variant_id":"${VARIANT}","quantity_ordered":"2","unit_cost":"3"}]`)).toEqual([
      { id: VARIANT, variant_id: VARIANT, quantity_ordered: "2", unit_cost: "3.00" },
    ]);
  });
});
