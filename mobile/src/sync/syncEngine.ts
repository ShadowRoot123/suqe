import { apiForSession, SyncCommand, SyncPullChange } from "@/api/endpoints";
import { Session } from "@/auth/session";
import { categoriesDelete, categoriesUpsert } from "@/catalog/categories";
import { productGroupMembershipsDelete, productGroupMembershipsUpsert } from "@/catalog/productGroupMemberships";
import { productGroupsDelete, productGroupsGetById, productGroupsUpsert } from "@/catalog/productGroups";
import { productsDelete, productsUpsert } from "@/catalog/products";
import { variantsDelete, variantsGetById, variantsUpsert } from "@/catalog/variants";
import { kvGet, kvSet } from "@/db/kv";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { locationsDelete, locationsGetById, locationsUpsert } from "@/inventory/locations";
import { movementsDelete, movementsUpsert } from "@/inventory/movements";
import { snapshotsSet } from "@/inventory/snapshots";
import { getDeviceId } from "@/sync/device";
import { makeIdempotencyKey } from "@/sync/idempotency";
import { outboxListPending, outboxMarkStatusByIdempotencyKey } from "@/sync/outbox";
import { outboxEnqueue } from "@/sync/outbox";
import { makeUuid } from "@/util/uuid";

const CURSOR_KEY = "sync_cursor";
const LAST_CHANGES_KEY = "sync_last_changes";

export async function getSyncCursor(): Promise<string | null> {
  return await kvGet(CURSOR_KEY);
}

async function setSyncCursor(next: string): Promise<void> {
  await kvSet(CURSOR_KEY, next);
}

export async function getLastSyncChanges(): Promise<SyncPullChange[]> {
  const raw = await kvGet(LAST_CHANGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncPullChange[]) : [];
  } catch {
    return [];
  }
}

export async function pushPending(session: Session) {
  const api = apiForSession(session);
  const deviceId = await getDeviceId();
  const pending = await outboxListPending(50);

  const commands: SyncCommand[] = pending.map((row) => ({
    idempotency_key: row.idempotency_key,
    entity: row.entity,
    operation: row.operation as any,
    payload: JSON.parse(row.payload),
  }));

  if (commands.length === 0) return { pushed: 0, outcomes: [] as any[] };

  const res = await api.syncPush({ device_id: deviceId, commands });

  for (const outcome of res.outcomes) {
    if (!outcome.idempotency_key) continue;
    if (outcome.status === "invalid") {
      await outboxMarkStatusByIdempotencyKey(outcome.idempotency_key, "rejected");
      continue;
    }
    await outboxMarkStatusByIdempotencyKey(outcome.idempotency_key, "enqueued");
  }

  return { pushed: commands.length, outcomes: res.outcomes };
}

export async function pullAcks(session: Session) {
  const api = apiForSession(session);
  const deviceId = await getDeviceId();
  const cursor = await getSyncCursor();

  const res = await api.syncPull({ device_id: deviceId, cursor, limit: 200 });
  await setSyncCursor(res.next_cursor);
  await kvSet(LAST_CHANGES_KEY, JSON.stringify(res.changes.slice(-50)));
  await applyChanges(res.changes);

  for (const ack of res.acks) {
    await outboxMarkStatusByIdempotencyKey(ack.idempotency_key, ack.status);
  }

  return { nextCursor: res.next_cursor, acks: res.acks.length, changes: res.changes.length };
}

export async function createCategoryOffline(name: string, parentId?: string | null) {
  const id = makeUuid();
  const now = new Date().toISOString();
  await categoriesUpsert({ id, name, parent_id: parentId ?? null, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("cat"),
    entity: "category",
    operation: "create",
    payload: { id, name, parent_id: parentId ?? null },
  });
  return id;
}

export async function createProductOffline(args: {
  name: string;
  sku: string;
  barcode?: string;
  category_id?: string | null;
  status?: string;
}) {
  const productId = makeUuid();
  const variantId = makeUuid();
  const now = new Date().toISOString();

  const status = args.status ?? "active";
  const category_id = args.category_id ?? null;

  await productsUpsert({ id: productId, name: args.name, category_id, status, updated_at: now });
  await variantsUpsert({
    id: variantId,
    product_id: productId,
    sku: args.sku,
    barcode: args.barcode ?? null,
    attrs: {},
    price: "0",
    cost_price: "0",
    updated_at: now,
  });

  const productKey = makeIdempotencyKey("prd");
  await outboxEnqueue({
    idempotencyKey: productKey,
    entity: "product",
    operation: "create",
    payload: { id: productId, name: args.name, category_id, status },
  });

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("var"),
    entity: "variant",
    operation: "create",
    payload: {
      id: variantId,
      product_id: productId,
      sku: args.sku,
      barcode: args.barcode ?? null,
      attrs: {},
      price: "0",
      cost_price: "0",
    },
  });

  return { productId, variantId, productIdempotencyKey: productKey };
}

export async function updateProductOffline(args: {
  id: string;
  name: string;
  category_id?: string | null;
  status?: string;
}) {
  const now = new Date().toISOString();
  const status = args.status ?? "active";
  const category_id = args.category_id ?? null;

  await productsUpsert({ id: args.id, name: args.name, category_id, status, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("prd"),
    entity: "product",
    operation: "update",
    payload: { id: args.id, name: args.name, category_id, status },
  });
}

export async function createVariantOffline(args: {
  product_id: string;
  sku: string;
  barcode?: string | null;
  attrs?: unknown;
  price?: string | number | null;
  cost_price?: string | number | null;
}) {
  const id = makeUuid();
  const now = new Date().toISOString();

  await variantsUpsert({
    id,
    product_id: args.product_id,
    sku: args.sku,
    barcode: args.barcode ?? null,
    attrs: args.attrs ?? {},
    price: args.price ?? "0",
    cost_price: args.cost_price ?? "0",
    updated_at: now,
  });

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("var"),
    entity: "variant",
    operation: "create",
    payload: {
      id,
      product_id: args.product_id,
      sku: args.sku,
      barcode: args.barcode ?? null,
      attrs: args.attrs ?? {},
      price: args.price ?? "0",
      cost_price: args.cost_price ?? "0",
    },
  });

  return id;
}

export async function updateVariantOffline(args: {
  id: string;
  product_id?: string;
  sku?: string;
  barcode?: string | null;
  attrs?: unknown;
  price?: string | number | null;
  cost_price?: string | number | null;
}) {
  const now = new Date().toISOString();
  const existing = await variantsGetById(args.id);
  if (!existing) throw new Error("Variant not found");
  const existingAttrs = (() => {
    try {
      return JSON.parse(existing.attrs_json) as unknown;
    } catch {
      return {};
    }
  })();

  const next = {
    id: args.id,
    product_id: args.product_id === undefined ? existing.product_id : args.product_id,
    sku: args.sku === undefined ? existing.sku : args.sku,
    barcode: args.barcode === undefined ? existing.barcode : args.barcode,
    attrs: args.attrs === undefined ? existingAttrs : args.attrs,
    price: args.price === undefined ? existing.price : args.price,
    cost_price: args.cost_price === undefined ? existing.cost_price : args.cost_price,
    updated_at: now,
  };

  await variantsUpsert(next);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("var"),
    entity: "variant",
    operation: "update",
    payload: {
      id: args.id,
      product_id: next.product_id,
      sku: next.sku,
      barcode: next.barcode,
      attrs: next.attrs,
      price: next.price,
      cost_price: next.cost_price,
    },
  });
}

export async function deleteVariantOffline(id: string) {
  await variantsDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("var"),
    entity: "variant",
    operation: "delete",
    payload: { id },
  });
}

export async function createProductGroupOffline(name: string, variant_options: Record<string, string[]> = {}) {
  const id = makeUuid();
  const now = new Date().toISOString();
  const variant_options_json = JSON.stringify(variant_options);

  await productGroupsUpsert({ id, name, variant_options_json, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("pg"),
    entity: "product_group",
    operation: "create",
    payload: { id, name, variant_options },
  });

  return id;
}

export async function updateProductGroupOffline(args: { id: string; name: string; variant_options?: Record<string, string[]> }) {
  const now = new Date().toISOString();
  let nextVariantOptions = args.variant_options;
  if (!nextVariantOptions) {
    const existing = await productGroupsGetById(args.id);
    if (existing?.variant_options_json) {
      try {
        const parsed = JSON.parse(existing.variant_options_json);
        nextVariantOptions = typeof parsed === "object" && parsed ? (parsed as Record<string, string[]>) : {};
      } catch {
        nextVariantOptions = {};
      }
    } else {
      nextVariantOptions = {};
    }
  }
  const variant_options_json = JSON.stringify(nextVariantOptions);

  await productGroupsUpsert({ id: args.id, name: args.name, variant_options_json, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("pg"),
    entity: "product_group",
    operation: "update",
    payload: { id: args.id, name: args.name, variant_options: nextVariantOptions },
  });
}

export async function deleteProductGroupOffline(id: string) {
  await productGroupsDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("pg"),
    entity: "product_group",
    operation: "delete",
    payload: { id },
  });
}

export async function addProductToGroupOffline(args: { product_group_id: string; product_id: string }) {
  const id = makeUuid();
  const now = new Date().toISOString();
  await productGroupMembershipsUpsert({ id, product_group_id: args.product_group_id, product_id: args.product_id, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("pgm"),
    entity: "product_group_membership",
    operation: "create",
    payload: { id, product_group_id: args.product_group_id, product_id: args.product_id },
  });
  return id;
}

export async function removeProductFromGroupOffline(membershipId: string) {
  await productGroupMembershipsDelete(membershipId);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("pgm"),
    entity: "product_group_membership",
    operation: "delete",
    payload: { id: membershipId },
  });
}

export type LocationType = "shop" | "warehouse";

export async function createLocationOffline(args: { name: string; type?: LocationType; address?: string | null }) {
  const id = makeUuid();
  const now = new Date().toISOString();
  const name = args.name.trim();
  const type = args.type ?? "shop";
  const address = args.address?.trim() ? args.address.trim() : null;
  if (!name) throw new Error("Name is required");

  await locationsUpsert({ id, name, type, address, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("loc"),
    entity: "location",
    operation: "create",
    payload: { id, name, type, address },
  });

  return id;
}

export async function updateLocationOffline(args: {
  id: string;
  name: string;
  type?: LocationType;
  address?: string | null;
}) {
  const now = new Date().toISOString();
  const name = args.name.trim();
  if (!name) throw new Error("Name is required");

  const existing = await locationsGetById(args.id);
  if (!existing) throw new Error("Location not found");

  const type = args.type ?? (existing.type as LocationType);
  const address = args.address === undefined ? existing.address : args.address?.trim() ? args.address.trim() : null;

  await locationsUpsert({ id: args.id, name, type, address, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("loc"),
    entity: "location",
    operation: "update",
    payload: { id: args.id, name, type, address },
  });
}

/**
 * The server refuses to delete a location stock has moved through, and the client can't know the
 * whole ledger, so the row goes optimistically. A refused delete leaves the location on the
 * server, and the next inventory refresh brings it back.
 */
export async function deleteLocationOffline(id: string) {
  await locationsDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("loc"),
    entity: "location",
    operation: "delete",
    payload: { id },
  });
}

/**
 * Records a stock adjustment locally and queues it. The movement stays `synced: 0` until the
 * server acknowledges it, so on-hand includes it immediately without double counting once the
 * server's own on-hand comes back through the pull feed.
 */
export async function createInventoryAdjustmentOffline(args: {
  variant_id: string;
  location_id: string;
  quantity_delta: number | string;
  reason?: string | null;
  created_by?: string | null;
}) {
  const delta = parseQuantity(args.quantity_delta);
  if (delta === null) throw new Error("Quantity must be a number");
  if (delta === 0) throw new Error("Quantity must not be zero");

  const id = makeUuid();
  const now = new Date().toISOString();
  const quantity_delta = formatQuantity(delta);
  const reason = args.reason?.trim() ? args.reason.trim() : null;

  await movementsUpsert({
    id,
    variant_id: args.variant_id,
    location_id: args.location_id,
    type: "adjustment",
    quantity_delta,
    note: reason,
    created_at: now,
    synced: false,
  });

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("adj"),
    entity: "inventory_adjustment",
    operation: "create",
    payload: {
      id,
      variant_id: args.variant_id,
      location_id: args.location_id,
      quantity_delta,
      reason,
      created_by: args.created_by ?? null,
    },
  });

  return id;
}

async function applyChanges(changes: SyncPullChange[]) {
  for (const change of changes) {
    const operation = String((change.metadata as any)?.operation ?? "");
    const record = (change.metadata as any)?.record;
    const id = String(change.entity_id ?? record?.id ?? "");
    if (!id) continue;

    if (change.action !== "sync.applied") {
      // A rejected adjustment never moved stock on the server, so drop the optimistic row
      // instead of leaving it pending forever and inflating on-hand.
      if (change.entity === "inventory_adjustment" && operation === "create") {
        await movementsDelete(id);
      }
      continue;
    }

    if (change.entity === "category") {
      if (operation === "delete") {
        await categoriesDelete(id);
        continue;
      }
      const name = String(record?.name ?? "");
      if (!name) continue;
      const parent_id = record?.parent_id ? String(record.parent_id) : null;
      await categoriesUpsert({ id, name, parent_id, updated_at: change.created_at });
      continue;
    }

    if (change.entity === "product") {
      if (operation === "delete") {
        await productsDelete(id);
        continue;
      }
      const name = String(record?.name ?? "");
      if (!name) continue;
      const category_id = record?.category_id ? String(record.category_id) : null;
      const status = record?.status ? String(record.status) : "active";
      await productsUpsert({ id, name, category_id, status, updated_at: change.created_at });
      continue;
    }

    if (change.entity === "variant") {
      if (operation === "delete") {
        await variantsDelete(id);
        continue;
      }
      const product_id = String(record?.product_id ?? "");
      const sku = String(record?.sku ?? "");
      if (!product_id || !sku) continue;
      const barcode = record?.barcode ? String(record.barcode) : null;
      const attrs = record?.attrs ?? record?.attributes ?? {};
      await variantsUpsert({
        id,
        product_id,
        sku,
        barcode,
        attrs,
        price: record?.price ?? "0",
        cost_price: record?.cost_price ?? "0",
        updated_at: change.created_at,
      });
      continue;
    }

    if (change.entity === "product_group") {
      if (operation === "delete") {
        await productGroupsDelete(id);
        continue;
      }
      const name = String(record?.name ?? "");
      if (!name) continue;
      let variant_options_json = "{}";
      if (record && Object.prototype.hasOwnProperty.call(record, "variant_options")) {
        const variant_options = (record as any).variant_options ?? {};
        variant_options_json = JSON.stringify(variant_options);
      } else {
        const existing = await productGroupsGetById(id);
        variant_options_json = existing?.variant_options_json ?? "{}";
      }
      await productGroupsUpsert({ id, name, variant_options_json, updated_at: change.created_at });
      continue;
    }

    if (change.entity === "product_group_membership") {
      if (operation === "delete") {
        await productGroupMembershipsDelete(id);
        continue;
      }
      const product_group_id = String(record?.product_group_id ?? "");
      const product_id = String(record?.product_id ?? "");
      if (!product_group_id || !product_id) continue;
      await productGroupMembershipsUpsert({ id, product_group_id, product_id, updated_at: change.created_at });
      continue;
    }

    if (change.entity === "location") {
      if (operation === "delete") {
        await locationsDelete(id);
        continue;
      }
      const name = String(record?.name ?? "");
      if (!name) continue;
      await locationsUpsert({
        id,
        name,
        type: record?.type ? String(record.type) : "shop",
        address: record?.address ? String(record.address) : null,
        updated_at: change.created_at,
      });
      continue;
    }

    if (change.entity === "inventory_adjustment") {
      const variant_id = String(record?.variant_id ?? "");
      const location_id = String(record?.location_id ?? "");
      if (!variant_id || !location_id) continue;

      // The ledger is append-only, so an applied adjustment only ever confirms a local row.
      await movementsUpsert({
        id,
        variant_id,
        location_id,
        type: record?.type ? String(record.type) : "adjustment",
        quantity_delta: record?.quantity_delta ?? "0",
        note: record?.note ? String(record.note) : null,
        created_at: record?.created_at ? String(record.created_at) : change.created_at,
        synced: true,
      });

      // The server sends its own on-hand with the change so we don't have to ask for it.
      const onHand = parseQuantity(record?.on_hand);
      if (onHand !== null) {
        await snapshotsSet({ variant_id, location_id, quantity: onHand, updated_at: change.created_at });
      }
    }
  }
}

export async function syncNow(session: Session) {
  const push = await pushPending(session);
  const pull = await pullAcks(session);
  return { push, pull };
}
