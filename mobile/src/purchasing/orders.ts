import { getDb } from "@/db/db";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { computeOrderTotal, formatMoney, parseMoney } from "@/purchasing/lib/money";
import { toOrderStatus, type OrderStatus } from "@/purchasing/lib/orderLifecycle";
import { Platform } from "react-native";

const WEB_KEY = "myshop.purchase_orders.v1";

export type OrderLineRow = {
  id: string;
  variant_id: string;
  quantity_ordered: string;
  unit_cost: string;
};

export type OrderRow = {
  id: string;
  supplier_id: string;
  location_id: string;
  status: OrderStatus;
  /** ISO 8601, or null when no delivery date was given. */
  expected_at: string | null;
  total_cost: string;
  created_by: string | null;
  items: OrderLineRow[];
  updated_at: string;
};

/**
 * The native row as it sits in SQLite. Lines live in an `items_json` TEXT column rather than a
 * second table: they only ever travel with their header (one sync command, one screen), nothing
 * queries across them, and a single column keeps the write atomic on both platforms — the web
 * store has no transaction to span two tables with.
 */
type OrderRowRaw = Omit<OrderRow, "items" | "status"> & { status: string; items_json: string };

function webRead(): OrderRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrderRow[];
    return Array.isArray(parsed) ? parsed.map(hydrate) : [];
  } catch {
    return [];
  }
}

function webWrite(rows: OrderRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

/** Malformed JSON means an order with no lines, never a crash. */
export function parseLines(value: unknown): OrderLineRow[] {
  const raw = (() => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const lines: OrderLineRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    const variant_id = typeof line.variant_id === "string" ? line.variant_id : "";
    if (!variant_id) continue;

    const quantity = parseQuantity(line.quantity_ordered);
    const cost = parseMoney(line.unit_cost);
    lines.push({
      id: typeof line.id === "string" && line.id ? line.id : variant_id,
      variant_id,
      quantity_ordered: formatQuantity(quantity ?? 0),
      unit_cost: formatMoney(cost ?? 0),
    });
  }
  return lines;
}

function hydrate(row: OrderRow): OrderRow {
  return { ...row, status: toOrderStatus(row.status), items: parseLines(row.items) };
}

function fromRaw(row: OrderRowRaw): OrderRow {
  const { items_json, ...rest } = row;
  return { ...rest, status: toOrderStatus(row.status), items: parseLines(items_json) };
}

export async function ordersUpsert(row: {
  id: string;
  supplier_id: string;
  location_id: string;
  status?: string | null;
  expected_at?: string | null;
  /** Recomputed from the lines when omitted, so a caller cannot store a total that disagrees. */
  total_cost?: string | number | null;
  created_by?: string | null;
  items?: unknown;
  updated_at?: string;
}) {
  const items = parseLines(row.items);
  const total = row.total_cost == null ? computeOrderTotal(items) : (parseMoney(row.total_cost) ?? 0);
  const normalized: OrderRow = {
    id: row.id,
    supplier_id: row.supplier_id,
    location_id: row.location_id,
    status: toOrderStatus(row.status),
    expected_at: row.expected_at ?? null,
    total_cost: formatMoney(total),
    created_by: row.created_by ?? null,
    items,
    updated_at: row.updated_at ?? new Date().toISOString(),
  };

  if (Platform.OS === "web") {
    const rows = webRead();
    const idx = rows.findIndex((r) => r.id === normalized.id);
    if (idx >= 0) rows[idx] = normalized;
    else rows.push(normalized);
    webWrite(rows);
    return;
  }

  const db = await getDb();
  await db.runAsync(
    "INSERT INTO purchase_orders (id, supplier_id, location_id, status, expected_at, total_cost, created_by, items_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET supplier_id = excluded.supplier_id, location_id = excluded.location_id, status = excluded.status, expected_at = excluded.expected_at, total_cost = excluded.total_cost, created_by = excluded.created_by, items_json = excluded.items_json, updated_at = excluded.updated_at",
    [
      normalized.id,
      normalized.supplier_id,
      normalized.location_id,
      normalized.status,
      normalized.expected_at,
      normalized.total_cost,
      normalized.created_by,
      JSON.stringify(normalized.items),
      normalized.updated_at,
    ]
  );
}

/**
 * Moves an order's status without touching anything else. The pull feed can deliver a status the
 * device has never seen (another till approved the order), and a local transition has to land the
 * same way, so this is separate from a full upsert.
 */
export async function ordersSetStatus(id: string, status: string, updatedAt?: string) {
  const next = toOrderStatus(status);
  const stamp = updatedAt ?? new Date().toISOString();

  if (Platform.OS === "web") {
    const rows = webRead();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    rows[idx] = { ...rows[idx], status: next, updated_at: stamp };
    webWrite(rows);
    return;
  }

  const db = await getDb();
  await db.runAsync("UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?", [next, stamp, id]);
}

export async function ordersDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((o) => o.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM purchase_orders WHERE id = ?", [id]);
}

export async function ordersList(): Promise<OrderRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  const rows = await db.getAllAsync<OrderRowRaw>("SELECT * FROM purchase_orders ORDER BY updated_at DESC");
  return rows.map(fromRaw);
}

export async function ordersGetById(id: string): Promise<OrderRow | null> {
  if (Platform.OS === "web") return webRead().find((o) => o.id === id) ?? null;
  const db = await getDb();
  const row = await db.getFirstAsync<OrderRowRaw>("SELECT * FROM purchase_orders WHERE id = ? LIMIT 1", [id]);
  return row ? fromRaw(row) : null;
}

/** Whether any order references a supplier — the local half of the server's delete guard. */
export async function ordersExistForSupplier(supplierId: string): Promise<boolean> {
  if (Platform.OS === "web") return webRead().some((o) => o.supplier_id === supplierId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM purchase_orders WHERE supplier_id = ? LIMIT 1",
    [supplierId]
  );
  return (row?.c ?? 0) > 0;
}
