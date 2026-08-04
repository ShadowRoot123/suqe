import { Platform } from "react-native";

import { movementsListUnsynced } from "@/inventory/movements";
import { salesGetById } from "@/sales/sales";
import { createSaleOffline, pushPending, voidSaleOffline } from "@/sync/syncEngine";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";

const SESSION = { accessToken: "token-1", orgId: "33333333-3333-4333-8333-333333333333" };

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

function outboxRows(): { idempotency_key: string; entity: string; operation: string; status: string }[] {
  return JSON.parse(globalThis.localStorage.getItem("myshop.outbox.v1") ?? "[]");
}

/** Answers `POST /sync/push` with whatever outcome the test wants for each queued command. */
function mockPush(outcomeFor: (row: { entity: string; operation: string }) => string) {
  const fetchMock = jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const outcomes = body.commands.map((c: any) => {
      const status = outcomeFor({ entity: c.entity, operation: c.operation });
      return status === "invalid"
        ? { idempotency_key: c.idempotency_key, status, error: "Forbidden: sale update requires pos.void_sale" }
        : { idempotency_key: c.idempotency_key, status, outbox_id: "server-1" };
    });

    return {
      ok: true,
      status: 200,
      statusText: "",
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
      text: async () => JSON.stringify({ received_at: "2026-08-04T10:00:00.000Z", outcomes }),
    } as any;
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

async function sell() {
  return await createSaleOffline({
    location_id: LOCATION,
    items: [{ variant_id: VARIANT, quantity: "2", unit_price: "5.00" }],
    payments: [{ method: "cash", amount: "10.00" }],
  });
}

async function unsyncedDelta() {
  const rows = await movementsListUnsynced();
  return rows.filter((m) => m.variant_id === VARIANT).reduce((sum, m) => sum + Number(m.quantity_delta), 0);
}

/**
 * A command the server refuses at **push** — because the caller's role does not carry its
 * permission — is never stored, so it never reaches the change feed and no `sync.failed` arrives
 * to trigger the usual repair. Without undoing it here the device keeps optimistic state the
 * server has never agreed to.
 */
describe("a command refused at push (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://example.test/api/v1";
  });

  test("a refused void takes the restored stock back out and un-voids the sale", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    expect((await salesGetById(id))?.status).toBe("voided");
    // The sale took 2 out and the void put 2 back.
    expect(await unsyncedDelta()).toBe(0);

    // The sale is accepted; only the void is refused, the way a `pos.sell` role would have it.
    mockPush((row) => (row.operation === "update" ? "invalid" : "enqueued"));
    await pushPending(SESSION as any);

    // The till must stop claiming the stock came back — the server still has the sale completed.
    expect((await salesGetById(id))?.status).toBe("completed");
    expect(await unsyncedDelta()).toBe(-2);
    expect((await movementsListUnsynced()).some((m) => m.id.startsWith("sale_void:"))).toBe(false);

    const rows = outboxRows();
    expect(rows.find((r) => r.operation === "update")?.status).toBe("rejected");
    // The accepted one is untouched and still on its way.
    expect(rows.find((r) => r.operation === "create")?.status).toBe("enqueued");
  });

  test("a refused sale drops the sale and the stock it took out", async () => {
    const id = await sell();

    mockPush(() => "invalid");
    await pushPending(SESSION as any);

    expect(await salesGetById(id)).toBeNull();
    expect(await movementsListUnsynced()).toEqual([]);
  });

  // The ordinary path must not undo anything.
  test("an accepted command leaves the optimistic state alone", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    mockPush(() => "enqueued");
    await pushPending(SESSION as any);

    expect((await salesGetById(id))?.status).toBe("voided");
    expect(await unsyncedDelta()).toBe(0);
    expect(outboxRows().every((r) => r.status === "enqueued")).toBe(true);
  });

  // A duplicate is the server saying "I already have this", not a refusal.
  test("a duplicate is not treated as a refusal", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    mockPush(() => "duplicate");
    await pushPending(SESSION as any);

    expect((await salesGetById(id))?.status).toBe("voided");
    expect(await unsyncedDelta()).toBe(0);
  });
});
