import { Platform } from "react-native";

import type { SyncPullChange } from "@/api/endpoints";
import { cellKey, foldOnHand } from "@/inventory/lib/onHand";
import { movementsListRecent, movementsListUnsynced } from "@/inventory/movements";
import { snapshotsList } from "@/inventory/snapshots";
import { salesGetById } from "@/sales/sales";
import { applyChanges, createSaleOffline, voidSaleOffline } from "@/sync/syncEngine";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";
/** The ids the server generates for its own rows — deliberately unlike this device's. */
const SERVER_LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SERVER_SALE_MOVEMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVER_VOID_MOVEMENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function sell() {
  return createSaleOffline({
    location_id: LOCATION,
    items: [{ variant_id: VARIANT, quantity: "2", unit_price: "5.00" }],
    payments: [{ method: "cash", amount: "10.00" }],
  });
}

/** A `sale` change off `GET /sync/pull`, shaped like `sale_record` in `process_pending.rb`. */
function saleChange(args: {
  id: string;
  status: "completed" | "voided";
  on_hand: string;
  action?: string;
  error?: string;
}): SyncPullChange {
  return {
    id: `change-${args.status}`,
    action: args.action ?? "sync.applied",
    entity: "sale",
    entity_id: args.id,
    created_at: "2026-08-03T10:00:00.000Z",
    metadata: {
      operation: args.status === "voided" ? "update" : "create",
      error: args.error ?? null,
      record: {
        id: args.id,
        location_id: LOCATION,
        cashier_id: null,
        status: args.status,
        subtotal: "10.0",
        discount: "0.0",
        tax: "0.0",
        total_amount: "10.0",
        sold_at: "2026-08-03T09:00:00.000Z",
        items: [
          {
            id: SERVER_LINE,
            variant_id: VARIANT,
            quantity: "2.0",
            unit_price: "5.0",
            discount: "0.0",
            tax: "0.0",
            on_hand: args.on_hand,
            movement_id: SERVER_SALE_MOVEMENT,
            // Only ever present once the sale has been voided.
            void_movement_id: args.status === "voided" ? SERVER_VOID_MOVEMENT : null,
          },
        ],
        payments: [{ id: "pay-1", method: "cash", amount: "10.0", reference: null }],
      },
    },
  };
}

/** What the app actually shows: the server snapshot plus every unacknowledged movement. */
async function displayedOnHand() {
  const [snapshots, unsynced] = await Promise.all([snapshotsList(), movementsListUnsynced()]);
  return foldOnHand(snapshots, unsynced).get(cellKey(VARIANT, LOCATION))?.quantity ?? 0;
}

/**
 * Folding a void back in is the one place the on-hand bookkeeping can silently count the restored
 * stock twice: this device wrote its own restore movements before the push, and the server wrote
 * its own after it. Only one set may survive — and the local ones cannot be found by line id,
 * because folding the sale's own echo has already replaced those with the server's.
 */
describe("folding a sale and its void back from the pull feed (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("a synced sale then a void leaves exactly the server's two movements", async () => {
    const id = await sell();
    // The sale syncs first: 20 on the shelf, 2 sold.
    await applyChanges([saleChange({ id, status: "completed", on_hand: "18.0" })]);
    expect(await displayedOnHand()).toBe(18);

    await voidSaleOffline({ id });
    // Restored on this device immediately, before the server has heard anything.
    expect(await displayedOnHand()).toBe(20);

    await applyChanges([saleChange({ id, status: "voided", on_hand: "20.0" })]);

    // 20, not 22: the optimistic restore was swapped for the server's, not added to it.
    expect(await displayedOnHand()).toBe(20);
    expect(await movementsListUnsynced()).toEqual([]);

    const ledger = await movementsListRecent();
    expect(ledger.map((m) => m.id).sort()).toEqual([SERVER_SALE_MOVEMENT, SERVER_VOID_MOVEMENT].sort());
    // The sale's own movement survives next to the compensating one — the pair is the history.
    expect(ledger.find((m) => m.id === SERVER_SALE_MOVEMENT)?.quantity_delta).toBe("-2");
    expect(ledger.find((m) => m.id === SERVER_VOID_MOVEMENT)).toMatchObject({
      quantity_delta: "2",
      type: "adjustment",
      synced: 1,
    });

    const sale = await salesGetById(id);
    expect(sale?.status).toBe("voided");
    expect(sale?.synced).toBe(1);
  });

  /**
   * The hard case. A sale voided before it ever synced pushes two commands, and the server echoes
   * both in one pull: folding the first replaces this device's line ids with the server's, so the
   * restore movements written against the old ids have to be found some other way.
   */
  test("a sale voided before it synced does not leave its restore movements behind", async () => {
    const id = await sell();
    await voidSaleOffline({ id });
    expect(await displayedOnHand()).toBe(0);

    await applyChanges([
      saleChange({ id, status: "completed", on_hand: "18.0" }),
      saleChange({ id, status: "voided", on_hand: "20.0" }),
    ]);

    expect(await displayedOnHand()).toBe(20);
    expect(await movementsListUnsynced()).toEqual([]);
    expect((await movementsListRecent()).map((m) => m.id).sort()).toEqual(
      [SERVER_SALE_MOVEMENT, SERVER_VOID_MOVEMENT].sort()
    );
  });

  /**
   * The create echo must not clear the void's restore movements: the void is still queued, so the
   * stock it put back has to stay put back until the server says otherwise.
   */
  test("the sale's own echo leaves a still-pending void's restored stock alone", async () => {
    const id = await sell();
    await voidSaleOffline({ id });

    await applyChanges([saleChange({ id, status: "completed", on_hand: "18.0" })]);

    // 18 from the server plus the 2 this device has put back and not yet pushed.
    expect(await displayedOnHand()).toBe(20);
    expect(await movementsListUnsynced()).toHaveLength(1);
  });

  /**
   * A refused void put nothing back on the server, so the stock this device restored has to come
   * out again — and unlike a refused purchase-order update, the status repairs itself: `completed`
   * is the only state a void can be refused from.
   */
  test("a refused void takes the stock back out and restores the status", async () => {
    const id = await sell();
    await applyChanges([saleChange({ id, status: "completed", on_hand: "18.0" })]);
    await voidSaleOffline({ id });
    expect(await displayedOnHand()).toBe(20);

    await applyChanges([
      saleChange({
        id,
        status: "voided",
        on_hand: "20.0",
        action: "sync.failed",
        error: "Cannot void a sale that is voided",
      }),
    ]);

    expect(await displayedOnHand()).toBe(18);
    expect(await movementsListUnsynced()).toEqual([]);
    expect((await salesGetById(id))?.status).toBe("completed");
  });

  // Voided on another till: this device has never seen the sale, so there is nothing to swap.
  test("a void for a sale this device does not hold still lands", async () => {
    const id = "99999999-9999-4999-8999-999999999999";
    await applyChanges([saleChange({ id, status: "voided", on_hand: "20.0" })]);

    expect((await salesGetById(id))?.status).toBe("voided");
    expect(await displayedOnHand()).toBe(20);
  });
});
