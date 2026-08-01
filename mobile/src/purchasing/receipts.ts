import { getDb } from "@/db/db";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { formatMoney, parseMoney } from "@/purchasing/lib/money";
import { Platform } from "react-native";

const WEB_KEY = "myshop.purchase_receipts.v1";

export type ReceiptLineRow = {
  id: string;
  variant_id: string;
  quantity_received: string;
  unit_cost: string;
};

export type ReceiptRow = {
  id: string;
  purchase_order_id: string;
  /** ISO 8601. */
  received_at: string;
  received_by: string | null;
  items: ReceiptLineRow[];
  /**
   * 0 until the server has acknowledged the command. Unlike an order, an unsynced receipt still
   * counts towards what has been received — it is the local ledger movement's twin, and the
   * outstanding quantity has to include goods this device booked in while offline.
   */
  synced: number;
  updated_at: string;
};

type ReceiptRowRaw = Omit<ReceiptRow, "items"> & { items_json: string };

function webRead(): ReceiptRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReceiptRow[];
    return Array.isArray(parsed) ? parsed.map(hydrate) : [];
  } catch {
    return [];
  }
}

function webWrite(rows: ReceiptRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

/** Malformed JSON means a receipt with no lines, never a crash. */
export function parseReceiptLines(value: unknown): ReceiptLineRow[] {
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

  const lines: ReceiptLineRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    const variant_id = typeof line.variant_id === "string" ? line.variant_id : "";
    if (!variant_id) continue;

    lines.push({
      id: typeof line.id === "string" && line.id ? line.id : variant_id,
      variant_id,
      quantity_received: formatQuantity(parseQuantity(line.quantity_received) ?? 0),
      unit_cost: formatMoney(parseMoney(line.unit_cost) ?? 0),
    });
  }
  return lines;
}

function hydrate(row: ReceiptRow): ReceiptRow {
  return { ...row, items: parseReceiptLines(row.items), synced: row.synced ? 1 : 0 };
}

function fromRaw(row: ReceiptRowRaw): ReceiptRow {
  const { items_json, ...rest } = row;
  return { ...rest, items: parseReceiptLines(items_json), synced: row.synced ? 1 : 0 };
}

export async function receiptsUpsert(row: {
  id: string;
  purchase_order_id: string;
  received_at?: string | null;
  received_by?: string | null;
  items?: unknown;
  synced?: boolean;
  updated_at?: string;
}) {
  const normalized: ReceiptRow = {
    id: row.id,
    purchase_order_id: row.purchase_order_id,
    received_at: row.received_at ?? new Date().toISOString(),
    received_by: row.received_by ?? null,
    items: parseReceiptLines(row.items),
    synced: row.synced ? 1 : 0,
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
    "INSERT INTO purchase_receipts (id, purchase_order_id, received_at, received_by, items_json, synced, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET purchase_order_id = excluded.purchase_order_id, received_at = excluded.received_at, received_by = excluded.received_by, items_json = excluded.items_json, synced = excluded.synced, updated_at = excluded.updated_at",
    [
      normalized.id,
      normalized.purchase_order_id,
      normalized.received_at,
      normalized.received_by,
      JSON.stringify(normalized.items),
      normalized.synced,
      normalized.updated_at,
    ]
  );
}

/** Only ever used to drop a local row the server rejected — applied receipts are immutable. */
export async function receiptsDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((r) => r.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM purchase_receipts WHERE id = ?", [id]);
}

export async function receiptsGetById(id: string): Promise<ReceiptRow | null> {
  if (Platform.OS === "web") return webRead().find((r) => r.id === id) ?? null;
  const db = await getDb();
  const row = await db.getFirstAsync<ReceiptRowRaw>("SELECT * FROM purchase_receipts WHERE id = ? LIMIT 1", [id]);
  return row ? fromRaw(row) : null;
}

/** Newest first — what the detail screen lists, and what outstanding quantities are totalled from. */
export async function receiptsListForOrder(purchaseOrderId: string): Promise<ReceiptRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .filter((r) => r.purchase_order_id === purchaseOrderId)
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  }
  const db = await getDb();
  const rows = await db.getAllAsync<ReceiptRowRaw>(
    "SELECT * FROM purchase_receipts WHERE purchase_order_id = ? ORDER BY received_at DESC",
    [purchaseOrderId]
  );
  return rows.map(fromRaw);
}
