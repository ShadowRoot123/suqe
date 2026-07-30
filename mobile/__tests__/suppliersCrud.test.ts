import { Platform } from "react-native";

import { ordersUpsert } from "@/purchasing/orders";
import { suppliersGetById, suppliersList } from "@/purchasing/suppliers";
import { outboxUnsettledEntityIds } from "@/sync/outbox";
import { createSupplierOffline, deleteSupplierOffline, updateSupplierOffline } from "@/sync/syncEngine";

const LOCATION = "22222222-2222-4222-8222-222222222222";
const VARIANT = "33333333-3333-4333-8333-333333333333";

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

describe("suppliers CRUD (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("create writes locally and queues one create", async () => {
    const id = await createSupplierOffline({
      name: "  Acme Supply  ",
      phone: "+123",
      email: "sales@acme.test",
      address: "1 Dock Road",
    });

    const row = await suppliersGetById(id);
    expect(row?.name).toBe("Acme Supply");
    expect(row?.email).toBe("sales@acme.test");

    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0].entity).toBe("supplier");
    expect(payloads()[0]).toEqual({
      operation: "create",
      payload: { id, name: "Acme Supply", phone: "+123", email: "sales@acme.test", address: "1 Dock Road" },
    });
  });

  test("a blank optional field is stored as null rather than an empty string", async () => {
    const id = await createSupplierOffline({ name: "Acme", phone: "   " });

    const row = await suppliersGetById(id);
    expect(row?.phone).toBeNull();
    expect(row?.email).toBeNull();
  });

  test("a name is required and nothing is queued without one", async () => {
    await expect(createSupplierOffline({ name: "   " })).rejects.toThrow("Name is required");

    expect(readOutbox()).toHaveLength(0);
    expect(await suppliersList()).toHaveLength(0);
  });

  test("update keeps fields the caller did not mention", async () => {
    const id = await createSupplierOffline({ name: "Acme", phone: "+123", email: "a@b.test" });

    await updateSupplierOffline({ id, name: "Acme Inc" });

    const row = await suppliersGetById(id);
    expect(row?.name).toBe("Acme Inc");
    expect(row?.phone).toBe("+123");
    expect(row?.email).toBe("a@b.test");
  });

  // The server only touches the keys a command names, so clearing has to be explicit.
  test("clearing a contact field sends null rather than omitting it", async () => {
    const id = await createSupplierOffline({ name: "Acme", phone: "+123" });

    await updateSupplierOffline({ id, name: "Acme", phone: "" });

    expect((await suppliersGetById(id))?.phone).toBeNull();
    expect(payloads()[1]).toEqual({
      operation: "update",
      payload: { id, name: "Acme", phone: null, email: null, address: null },
    });
  });

  test("delete removes the row optimistically and queues the command", async () => {
    const id = await createSupplierOffline({ name: "Acme" });

    await deleteSupplierOffline(id);

    expect(await suppliersGetById(id)).toBeNull();
    expect(payloads().map((p) => p.operation)).toEqual(["create", "delete"]);
  });

  /**
   * The server refuses this with a restrict violation. Catching it locally means the user is told
   * straight away instead of watching the row vanish and reappear on the next refresh.
   */
  test("a supplier with an order cannot be deleted, and nothing is queued", async () => {
    const id = await createSupplierOffline({ name: "Acme" });
    await ordersUpsert({
      id: "44444444-4444-4444-8444-444444444444",
      supplier_id: id,
      location_id: LOCATION,
      status: "draft",
      items: [{ id: "55555555-5555-4555-8555-555555555555", variant_id: VARIANT, quantity_ordered: "1", unit_cost: "1" }],
    });

    await expect(deleteSupplierOffline(id)).rejects.toThrow("cannot be deleted");

    expect(await suppliersGetById(id)).not.toBeNull();
    expect(payloads().map((p) => p.operation)).toEqual(["create"]);
  });

  test("ids with unacknowledged commands are reported so a REST refresh cannot overwrite them", async () => {
    const id = await createSupplierOffline({ name: "Acme" });

    expect(await outboxUnsettledEntityIds("supplier")).toEqual(new Set([id]));

    const rows = readOutbox();
    rows.forEach((r) => {
      r.status = "applied";
    });
    globalThis.localStorage.setItem("myshop.outbox.v1", JSON.stringify(rows));

    expect(await outboxUnsettledEntityIds("supplier")).toEqual(new Set());
  });
});
