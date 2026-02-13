import { apiForSession, SyncCommand, SyncPullChange } from "@/api/endpoints";
import { Session } from "@/auth/session";
import { categoriesDelete, categoriesUpsert } from "@/catalog/categories";
import { productsDelete, productsUpsert } from "@/catalog/products";
import { variantsDelete, variantsUpsert } from "@/catalog/variants";
import { kvGet, kvSet } from "@/db/kv";
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

async function applyChanges(changes: SyncPullChange[]) {
  for (const change of changes) {
    if (change.action !== "sync.applied") continue;
    const operation = String((change.metadata as any)?.operation ?? "");
    const record = (change.metadata as any)?.record;
    const id = String(change.entity_id ?? record?.id ?? "");
    if (!id) continue;

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
    }
  }
}

export async function syncNow(session: Session) {
  const push = await pushPending(session);
  const pull = await pullAcks(session);
  return { push, pull };
}
