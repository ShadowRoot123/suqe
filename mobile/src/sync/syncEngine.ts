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
import { thresholdsDelete, thresholdsFindTarget, thresholdsUpsert } from "@/inventory/thresholds";
import { formatMoney, parseMoney } from "@/purchasing/lib/money";
import { isEditable, transitionError, type OrderStatus } from "@/purchasing/lib/orderLifecycle";
import { receiptError, statusAfterReceipts, type ReceiptInputLine } from "@/purchasing/lib/receiving";
import {
  ordersDelete,
  ordersExistForSupplier,
  ordersGetById,
  ordersSetStatus,
  ordersUpsert,
  type OrderLineRow,
} from "@/purchasing/orders";
import {
  receiptsDelete,
  receiptsGetById,
  receiptsListForOrder,
  receiptsUpsert,
  type ReceiptLineRow,
} from "@/purchasing/receipts";
import { computeSaleTotals, saleError, type PaymentInput } from "@/sales/lib/saleTotals";
import { salesDelete, salesGetById, salesUpsert, type SaleLineRow, type SalePaymentRow } from "@/sales/sales";
import { suppliersDelete, suppliersGetById, suppliersUpsert } from "@/purchasing/suppliers";
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

/**
 * Sets the reorder point for a variant at one location, or for the variant everywhere when
 * `location_id` is null. One entry point rather than create/update, because "there is already a
 * row for this target" is an implementation detail the caller should not have to look up — and
 * the server resolves a duplicate create onto the existing row anyway.
 */
export async function setStockThresholdOffline(args: {
  variant_id: string;
  location_id?: string | null;
  reorder_point: number | string;
  reorder_quantity?: number | string | null;
}) {
  const point = parseQuantity(args.reorder_point);
  if (point === null) throw new Error("Reorder point must be a number");
  if (point < 0) throw new Error("Reorder point must not be negative");

  const rawQuantity = args.reorder_quantity;
  const hasQuantity = rawQuantity !== null && rawQuantity !== undefined && String(rawQuantity).trim() !== "";
  const quantity = hasQuantity ? parseQuantity(rawQuantity) : null;
  if (hasQuantity && quantity === null) throw new Error("Reorder quantity must be a number");
  if (quantity !== null && quantity <= 0) throw new Error("Reorder quantity must be greater than zero");

  const location_id = args.location_id ?? null;
  const reorder_point = formatQuantity(point);
  const reorder_quantity = quantity === null ? null : formatQuantity(quantity);
  const now = new Date().toISOString();

  const existing = await thresholdsFindTarget(args.variant_id, location_id);
  const id = existing?.id ?? makeUuid();

  await thresholdsUpsert({ id, variant_id: args.variant_id, location_id, reorder_point, reorder_quantity, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("thr"),
    entity: "stock_threshold",
    operation: existing ? "update" : "create",
    // An update carries reorder_quantity even when null: the server only touches the keys the
    // command names, so omitting it would leave a stale quantity behind instead of clearing it.
    payload: existing
      ? { id, reorder_point, reorder_quantity }
      : { id, variant_id: args.variant_id, location_id, reorder_point, reorder_quantity },
  });

  return id;
}

export async function deleteStockThresholdOffline(id: string) {
  await thresholdsDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("thr"),
    entity: "stock_threshold",
    operation: "delete",
    payload: { id },
  });
}

export async function createSupplierOffline(args: {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const id = makeUuid();
  const now = new Date().toISOString();
  const name = args.name.trim();
  if (!name) throw new Error("Name is required");

  const contact = {
    phone: args.phone?.trim() || null,
    email: args.email?.trim() || null,
    address: args.address?.trim() || null,
  };

  await suppliersUpsert({ id, name, ...contact, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("sup"),
    entity: "supplier",
    operation: "create",
    payload: { id, name, ...contact },
  });

  return id;
}

export async function updateSupplierOffline(args: {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const now = new Date().toISOString();
  const name = args.name.trim();
  if (!name) throw new Error("Name is required");

  const existing = await suppliersGetById(args.id);
  if (!existing) throw new Error("Supplier not found");

  // A field the caller left undefined keeps its current value; an empty string clears it, and the
  // command carries the null so the server stops sending the old one back.
  const contact = {
    phone: args.phone === undefined ? existing.phone : args.phone?.trim() || null,
    email: args.email === undefined ? existing.email : args.email?.trim() || null,
    address: args.address === undefined ? existing.address : args.address?.trim() || null,
  };

  await suppliersUpsert({ id: args.id, name, ...contact, updated_at: now });
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("sup"),
    entity: "supplier",
    operation: "update",
    payload: { id: args.id, name, ...contact },
  });
}

/**
 * The server refuses to delete a supplier the org has ordered from. The local store knows about
 * every order it has seen, so the obvious case is caught here and the user is told immediately;
 * an order this device has never pulled still gets refused server-side, and the next purchasing
 * refresh brings the supplier back.
 */
export async function deleteSupplierOffline(id: string) {
  if (await ordersExistForSupplier(id)) {
    throw new Error("Supplier has purchase orders and cannot be deleted");
  }

  await suppliersDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("sup"),
    entity: "supplier",
    operation: "delete",
    payload: { id },
  });
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Mirrors `parse_time` in process_pending.rb: strictly ISO 8601, with a date on its own accepted
 * because a delivery-date picker has no reason to carry a time. The server rejects anything else,
 * so catching it here turns a command that would fail after the next push into an error the user
 * sees while the field is still in front of them.
 */
function normalizeExpectedAt(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_ONLY.test(trimmed) && !ISO_DATETIME.test(trimmed)) {
    throw new Error("Expected date must look like 2026-08-20");
  }
  if (Number.isNaN(new Date(trimmed).getTime())) throw new Error("Expected date is not a real date");

  return trimmed;
}

export type PurchaseOrderLineInput = {
  id?: string | null;
  variant_id: string;
  quantity_ordered: string | number;
  unit_cost: string | number;
};

/**
 * Validates lines the way `Purchasing::OrderLines` does, so a bad row is refused before anything is
 * queued rather than coming back as a failed command. Line ids are generated here when absent: the
 * client owns them, which is what lets an edit keep a surviving row's identity.
 */
function normalizeOrderLines(items: PurchaseOrderLineInput[] | undefined): OrderLineRow[] {
  const lines: OrderLineRow[] = [];
  const seen = new Set<string>();

  for (const item of items ?? []) {
    if (!item?.variant_id) throw new Error("Every line needs an item");
    if (seen.has(item.variant_id)) throw new Error("The same item is on two lines");
    seen.add(item.variant_id);

    const quantity = parseQuantity(item.quantity_ordered);
    if (quantity === null) throw new Error("Quantity must be a number");
    if (quantity <= 0) throw new Error("Quantity must be greater than zero");

    const cost = parseMoney(item.unit_cost);
    if (cost === null) throw new Error("Unit cost must be a number");
    if (cost < 0) throw new Error("Unit cost must not be negative");

    lines.push({
      id: item.id || makeUuid(),
      variant_id: item.variant_id,
      quantity_ordered: formatQuantity(quantity),
      unit_cost: formatMoney(cost),
    });
  }

  return lines;
}

export async function createPurchaseOrderOffline(args: {
  supplier_id: string;
  location_id: string;
  expected_at?: string | null;
  items?: PurchaseOrderLineInput[];
  created_by?: string | null;
}) {
  if (!args.supplier_id) throw new Error("Choose a supplier");
  if (!args.location_id) throw new Error("Choose a delivery location");

  const id = makeUuid();
  const now = new Date().toISOString();
  const items = normalizeOrderLines(args.items);
  const expected_at = normalizeExpectedAt(args.expected_at);

  await ordersUpsert({
    id,
    supplier_id: args.supplier_id,
    location_id: args.location_id,
    status: "draft",
    expected_at,
    created_by: args.created_by ?? null,
    items,
    updated_at: now,
  });

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("po"),
    entity: "purchase_order",
    operation: "create",
    payload: {
      id,
      supplier_id: args.supplier_id,
      location_id: args.location_id,
      status: "draft",
      expected_at,
      items,
      created_by: args.created_by ?? null,
    },
  });

  return id;
}

/** Edits a draft's header and lines. The whole line set travels, because that is the contract. */
export async function updatePurchaseOrderOffline(args: {
  id: string;
  supplier_id?: string;
  location_id?: string;
  expected_at?: string | null;
  items?: PurchaseOrderLineInput[];
}) {
  const existing = await ordersGetById(args.id);
  if (!existing) throw new Error("Purchase order not found");
  if (!isEditable(existing.status)) {
    throw new Error(`Cannot edit a purchase order that is ${existing.status}`);
  }

  const now = new Date().toISOString();
  const supplier_id = args.supplier_id ?? existing.supplier_id;
  const location_id = args.location_id ?? existing.location_id;
  const expected_at = args.expected_at === undefined ? existing.expected_at : normalizeExpectedAt(args.expected_at);
  const items = args.items === undefined ? existing.items : normalizeOrderLines(args.items);

  await ordersUpsert({
    id: args.id,
    supplier_id,
    location_id,
    status: existing.status,
    expected_at,
    created_by: existing.created_by,
    items,
    updated_at: now,
  });

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("po"),
    entity: "purchase_order",
    operation: "update",
    payload: { id: args.id, supplier_id, location_id, expected_at, items },
  });
}

/**
 * Moves an order along the lifecycle. The transition is checked locally first — the mirror of the
 * server's table in purchasing/lib/orderLifecycle.ts — so an illegal move is refused while the
 * user is still looking at the button instead of failing on a push minutes later.
 */
export async function transitionPurchaseOrderOffline(args: { id: string; status: OrderStatus }) {
  const existing = await ordersGetById(args.id);
  if (!existing) throw new Error("Purchase order not found");

  const error = transitionError({ from: existing.status, to: args.status, lineCount: existing.items.length });
  if (error) throw new Error(error);
  if (existing.status === args.status) return;

  await ordersSetStatus(args.id, args.status);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("po"),
    entity: "purchase_order",
    operation: "update",
    // Status only: a full payload would re-send the lines, and the server refuses line edits on
    // anything past draft — approving an order would fail on its own command.
    payload: { id: args.id, status: args.status },
  });
}

/**
 * Books goods in against an order. Validated locally first — the mirror in
 * `purchasing/lib/receiving.ts` — so an over-receipt is refused while the user is looking at the
 * field rather than after the next push.
 *
 * Three local writes, in the shape the pull feed will confirm: the receipt, one **unsynced
 * `purchase` movement per line** (so on-hand rises immediately, exactly as an offline adjustment
 * does), and the order's status. Each movement takes its receipt line's id, which is what lets a
 * refused receipt find and drop them again.
 */
export async function receiveOrderOffline(args: {
  purchase_order_id: string;
  items: ReceiptInputLine[];
  received_at?: string | null;
  received_by?: string | null;
}) {
  const order = await ordersGetById(args.purchase_order_id);
  if (!order) throw new Error("Purchase order not found");

  const receipts = await receiptsListForOrder(order.id);
  const error = receiptError({ order, receipts, lines: args.items });
  if (error) throw new Error(error);

  const id = makeUuid();
  const now = new Date().toISOString();
  const received_at = args.received_at ?? now;
  const ordered = new Map(order.items.map((line) => [line.variant_id, line]));

  const items: ReceiptLineRow[] = args.items.map((line) => {
    const quantity = parseQuantity(line.quantity_received) ?? 0;
    // A line that names no cost was received at the cost it was ordered at — the same default
    // the server applies, resolved here so the local row is not a guess.
    const named = line.unit_cost !== null && line.unit_cost !== undefined && String(line.unit_cost).trim() !== "";
    const cost = named ? parseMoney(line.unit_cost) : parseMoney(ordered.get(line.variant_id)?.unit_cost);
    return {
      id: makeUuid(),
      variant_id: line.variant_id,
      quantity_received: formatQuantity(quantity),
      unit_cost: formatMoney(cost ?? 0),
    };
  });

  await receiptsUpsert({
    id,
    purchase_order_id: order.id,
    received_at,
    received_by: args.received_by ?? null,
    items,
    synced: false,
    updated_at: now,
  });

  for (const line of items) {
    await movementsUpsert({
      id: line.id,
      variant_id: line.variant_id,
      location_id: order.location_id,
      type: "purchase",
      quantity_delta: line.quantity_received,
      created_at: received_at,
      synced: false,
    });
  }

  // The status follows the goods. `ordersSetStatus` rather than a transition command: the status
  // is the server's to settle, and it will confirm it on the receipt's own change record.
  await ordersSetStatus(order.id, statusAfterReceipts(order, [...receipts, { items }]), now);

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("rec"),
    entity: "purchase_receipt",
    operation: "create",
    payload: {
      id,
      purchase_order_id: order.id,
      received_at,
      received_by: args.received_by ?? null,
      items,
    },
  });

  return id;
}

export async function deletePurchaseOrderOffline(id: string) {
  const existing = await ordersGetById(id);
  if (existing && !isEditable(existing.status)) {
    throw new Error(`Cannot delete a purchase order that is ${existing.status}`);
  }

  await ordersDelete(id);
  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("po"),
    entity: "purchase_order",
    operation: "delete",
    payload: { id },
  });
}

export type CartLineInput = {
  variant_id: string;
  quantity: string | number;
  unit_price: string | number;
  discount?: string | number | null;
  tax?: string | number | null;
};

/**
 * Finalises a sale. The command the whole offline story is for: the cashier takes the money and
 * hands over the goods before the server has heard anything, so everything here is written as if
 * the sale is final — because in the shop it is.
 *
 * Validated locally first through the mirror in `sales/lib/saleTotals.ts`, then three local
 * writes in the shape the pull feed will confirm: the sale, one **unsynced negative `sale`
 * movement per line** (so on-hand drops immediately, the way an offline adjustment does), and the
 * outbox command. Each movement takes its line's id, which is what lets a refused sale find and
 * drop them again.
 */
export async function createSaleOffline(args: {
  location_id: string;
  items: CartLineInput[];
  payments: PaymentInput[];
  cashier_id?: string | null;
  sold_at?: string | null;
}) {
  if (!args.location_id) throw new Error("Choose a location to sell from");

  const lines = args.items.map((line) => ({
    variant_id: line.variant_id,
    quantity: line.quantity,
    unit_price: line.unit_price,
    discount: line.discount ?? 0,
    tax: line.tax ?? 0,
  }));

  const error = saleError({ lines, payments: args.payments });
  if (error) throw new Error(error);

  const id = makeUuid();
  const now = new Date().toISOString();
  const sold_at = args.sold_at ?? now;

  const items: SaleLineRow[] = lines.map((line) => ({
    id: makeUuid(),
    variant_id: line.variant_id,
    quantity: formatQuantity(parseQuantity(line.quantity) ?? 0),
    unit_price: formatMoney(parseMoney(line.unit_price) ?? 0),
    discount: formatMoney(parseMoney(line.discount) ?? 0),
    tax: formatMoney(parseMoney(line.tax) ?? 0),
  }));

  const payments: SalePaymentRow[] = args.payments.map((payment) => ({
    id: makeUuid(),
    method: String(payment.method),
    amount: formatMoney(parseMoney(payment.amount) ?? 0),
    reference: null,
  }));

  const totals = computeSaleTotals(items);

  await salesUpsert({
    id,
    location_id: args.location_id,
    cashier_id: args.cashier_id ?? null,
    status: "completed",
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total_amount: totals.total_amount,
    sold_at,
    items,
    payments,
    synced: false,
  });

  for (const line of items) {
    await movementsUpsert({
      id: line.id,
      variant_id: line.variant_id,
      location_id: args.location_id,
      type: "sale",
      // Negative: stock leaves the shop with the customer.
      quantity_delta: -(parseQuantity(line.quantity) ?? 0),
      created_at: sold_at,
      synced: false,
    });
  }

  await outboxEnqueue({
    idempotencyKey: makeIdempotencyKey("sale"),
    entity: "sale",
    operation: "create",
    payload: {
      id,
      location_id: args.location_id,
      cashier_id: args.cashier_id ?? null,
      sold_at,
      items,
      payments: payments.map((payment) => ({ id: payment.id, method: payment.method, amount: payment.amount })),
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
      // Same reasoning for a refused reorder point: nothing was configured on the server, so
      // leaving the row would show a low-stock badge no other device agrees with.
      if (change.entity === "stock_threshold" && operation === "create") {
        await thresholdsDelete(id);
      }
      if (change.entity === "supplier" && operation === "create") {
        await suppliersDelete(id);
      }
      // A refused order create never landed on the server, so the optimistic row goes. A refused
      // *update* — a transition another device already made illegal — leaves the local status
      // ahead of the server's, and the failed change carries the rejected command rather than the
      // surviving row, so there is nothing here to restore it from. The next purchasing refresh
      // corrects it; same limitation as a refused location delete.
      if (change.entity === "purchase_order" && operation === "create") {
        await ordersDelete(id);
      }
      // A refused receipt never moved stock on the server, so the optimistic receipt and its
      // movements go. Unlike a refused order update this one *can* repair the status it left
      // behind: the receipts are local, so the order's status is recomputed from the ones that
      // survive — back to `approved` when this was the only one.
      // A refused sale never happened on the server, so the optimistic sale and the stock it took
      // out go with it. This is the loudest failure in the app — the shop believes it sold
      // something the server would not accept — so the till's history has to stop claiming it.
      if (change.entity === "sale" && operation === "create") {
        const rejected = await salesGetById(id);
        if (rejected) {
          for (const line of rejected.items) await movementsDelete(line.id);
          await salesDelete(id);
        }
      }
      if (change.entity === "purchase_receipt" && operation === "create") {
        const rejected = await receiptsGetById(id);
        if (rejected) {
          for (const line of rejected.items) await movementsDelete(line.id);
          await receiptsDelete(id);

          const order = await ordersGetById(rejected.purchase_order_id);
          if (order) {
            const surviving = await receiptsListForOrder(order.id);
            await ordersSetStatus(order.id, statusAfterReceipts(order, surviving), change.created_at);
          }
        }
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

    if (change.entity === "stock_threshold") {
      if (operation === "delete") {
        await thresholdsDelete(id);
        continue;
      }
      const variant_id = String(record?.variant_id ?? "");
      // A delete carries only an id, and so does an update the server no-opped; without a
      // variant there is nothing to key the row on, and the local copy is already correct.
      if (!variant_id) continue;

      await thresholdsUpsert({
        id,
        variant_id,
        location_id: record?.location_id ? String(record.location_id) : null,
        reorder_point: record?.reorder_point ?? "0",
        reorder_quantity: record?.reorder_quantity ?? null,
        updated_at: change.created_at,
      });
      continue;
    }

    if (change.entity === "supplier") {
      if (operation === "delete") {
        await suppliersDelete(id);
        continue;
      }
      const name = String(record?.name ?? "");
      // An update the server no-opped (a row from another org, say) carries only an id; the local
      // copy is already right, so there is nothing to fold in.
      if (!name) continue;

      await suppliersUpsert({
        id,
        name,
        phone: record?.phone ? String(record.phone) : null,
        email: record?.email ? String(record.email) : null,
        address: record?.address ? String(record.address) : null,
        updated_at: change.created_at,
      });
      continue;
    }

    if (change.entity === "purchase_order") {
      if (operation === "delete") {
        await ordersDelete(id);
        continue;
      }

      const supplier_id = String(record?.supplier_id ?? "");
      const location_id = String(record?.location_id ?? "");
      if (!supplier_id || !location_id) continue;

      // The server's record is authoritative for the whole order, lines included: it recomputed
      // the total from the lines it actually stored, and a duplicate create may have resolved onto
      // a row this device has not seen.
      await ordersUpsert({
        id,
        supplier_id,
        location_id,
        status: record?.status ? String(record.status) : "draft",
        expected_at: record?.expected_at ? String(record.expected_at) : null,
        total_cost: record?.total_cost ?? null,
        created_by: record?.created_by ? String(record.created_by) : null,
        items: record?.items ?? [],
        updated_at: change.created_at,
      });
      continue;
    }

    if (change.entity === "purchase_receipt") {
      const purchase_order_id = String(record?.purchase_order_id ?? "");
      if (!purchase_order_id) continue;

      const items = Array.isArray(record?.items) ? (record.items as any[]) : [];
      const local = await receiptsGetById(id);

      await receiptsUpsert({
        id,
        purchase_order_id,
        received_at: record?.received_at ? String(record.received_at) : change.created_at,
        received_by: record?.received_by ? String(record.received_by) : null,
        items,
        synced: true,
        updated_at: change.created_at,
      });

      // The optimistic movements were keyed by this device's line ids; the server's carry its own.
      // Drop ours before adding the server's, or the ledger would hold both and on-hand would
      // count the delivery twice.
      for (const line of local?.items ?? []) await movementsDelete(line.id);

      const location_id = String(record?.purchase_order?.location_id ?? "");
      for (const line of items) {
        const variant_id = String(line?.variant_id ?? "");
        if (!variant_id) continue;

        const movement_id = line?.movement_id ? String(line.movement_id) : "";
        if (movement_id && location_id) {
          await movementsUpsert({
            id: movement_id,
            variant_id,
            location_id,
            type: "purchase",
            quantity_delta: line?.quantity_received ?? "0",
            created_at: record?.received_at ? String(record.received_at) : change.created_at,
            synced: true,
          });
        }

        // The server sends the on-hand each line landed at, so we don't have to ask for it.
        const onHand = parseQuantity(line?.on_hand);
        if (onHand !== null && location_id) {
          await snapshotsSet({ variant_id, location_id, quantity: onHand, updated_at: change.created_at });
        }
      }

      // The receipt is what settled the order's status, and it travels with it.
      const settled = record?.purchase_order?.status;
      if (settled) await ordersSetStatus(purchase_order_id, String(settled), change.created_at);
      continue;
    }

    if (change.entity === "sale") {
      const location_id = String(record?.location_id ?? "");
      if (!location_id) continue;

      const items = Array.isArray(record?.items) ? (record.items as any[]) : [];
      const local = await salesGetById(id);

      await salesUpsert({
        id,
        location_id,
        cashier_id: record?.cashier_id ? String(record.cashier_id) : null,
        status: record?.status ? String(record.status) : "completed",
        // The server's totals win: it derived them from the lines it actually stored.
        subtotal: record?.subtotal ?? null,
        discount: record?.discount ?? null,
        tax: record?.tax ?? null,
        total_amount: record?.total_amount ?? null,
        sold_at: record?.sold_at ? String(record.sold_at) : change.created_at,
        items,
        payments: Array.isArray(record?.payments) ? record.payments : [],
        synced: true,
      });

      // Same swap as a receipt's: our optimistic movements are keyed by this device's line ids
      // and the server's carry its own, so ours go before the server's land — otherwise the
      // ledger holds both and on-hand drops twice.
      for (const line of local?.items ?? []) await movementsDelete(line.id);

      for (const line of items) {
        const variant_id = String(line?.variant_id ?? "");
        if (!variant_id) continue;

        const movement_id = line?.movement_id ? String(line.movement_id) : "";
        if (movement_id) {
          await movementsUpsert({
            id: movement_id,
            variant_id,
            location_id,
            type: "sale",
            quantity_delta: -(parseQuantity(line?.quantity) ?? 0),
            created_at: record?.sold_at ? String(record.sold_at) : change.created_at,
            synced: true,
          });
        }

        // The server sends the on-hand each line landed at, so we don't have to ask for it.
        const onHand = parseQuantity(line?.on_hand);
        if (onHand !== null) {
          await snapshotsSet({ variant_id, location_id, quantity: onHand, updated_at: change.created_at });
        }
      }
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
