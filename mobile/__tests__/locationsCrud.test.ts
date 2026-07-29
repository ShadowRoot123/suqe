import { Platform } from "react-native";

import { locationsGetById, locationsList } from "@/inventory/locations";
import { outboxUnsettledEntityIds } from "@/sync/outbox";
import { createLocationOffline, deleteLocationOffline, updateLocationOffline } from "@/sync/syncEngine";

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

describe("locations CRUD (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("create writes locally and queues one command", async () => {
    const id = await createLocationOffline({ name: "  Back Warehouse  ", type: "warehouse", address: " 12 Dock Rd " });

    const created = await locationsGetById(id);
    expect(created?.name).toBe("Back Warehouse");
    expect(created?.type).toBe("warehouse");
    expect(created?.address).toBe("12 Dock Rd");

    const queued = readOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].entity).toBe("location");
    expect(queued[0].operation).toBe("create");
    expect(JSON.parse(queued[0].payload)).toMatchObject({ id, name: "Back Warehouse", type: "warehouse" });
  });

  test("create defaults to a shop and stores a blank address as null", async () => {
    const id = await createLocationOffline({ name: "Kiosk", address: "   " });

    const created = await locationsGetById(id);
    expect(created?.type).toBe("shop");
    expect(created?.address).toBeNull();
  });

  test("create rejects a blank name without queuing anything", async () => {
    await expect(createLocationOffline({ name: "   " })).rejects.toThrow("Name is required");
    expect(readOutbox()).toHaveLength(0);
  });

  test("update keeps the fields the caller left alone", async () => {
    const id = await createLocationOffline({ name: "Main Shop", type: "shop", address: "1 High St" });

    await updateLocationOffline({ id, name: "Flagship Shop" });

    const updated = await locationsGetById(id);
    expect(updated?.name).toBe("Flagship Shop");
    expect(updated?.address).toBe("1 High St");
    expect(updated?.type).toBe("shop");
  });

  test("delete removes the row optimistically and queues the command", async () => {
    const id = await createLocationOffline({ name: "Pop-up" });

    await deleteLocationOffline(id);

    expect(await locationsGetById(id)).toBeNull();
    expect(await locationsList()).toHaveLength(0);
    expect(readOutbox().map((r) => r.operation)).toEqual(["create", "delete"]);
  });

  test("ids with unacknowledged commands are reported so a REST refresh cannot overwrite them", async () => {
    const id = await createLocationOffline({ name: "Main Shop" });
    expect(await outboxUnsettledEntityIds("location")).toEqual(new Set([id]));

    // Nothing is in flight for another entity, and settled commands stop protecting the row.
    expect(await outboxUnsettledEntityIds("product")).toEqual(new Set());

    const rows = readOutbox();
    rows.forEach((r) => {
      r.status = "applied";
    });
    globalThis.localStorage.setItem("myshop.outbox.v1", JSON.stringify(rows));

    expect(await outboxUnsettledEntityIds("location")).toEqual(new Set());
  });
});
