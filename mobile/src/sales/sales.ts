import { getDb } from "@/db/db";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { computeSaleTotals, isPaymentMethod } from "@/sales/lib/saleTotals";
import { formatMoney, parseMoney } from "@/util/money";
import { Platform } from "react-native";

const WEB_KEY = "myshop.sales.v1";

export type SaleLineRow = {
  id: string;
  variant_id: string;
  quantity: string;
  unit_price: string;
  discount: string;
  tax: string;
};

export type SalePaymentRow = {
  id: string;
  method: string;
  amount: string;
  reference: string | null;
};

export type SaleRow = {
  id: string;
  location_id: string;
  cashier_id: string | null;
  status: string;
  subtotal: string;
  discount: string;
  tax: string;
  total_amount: string;
  /** ISO 8601. */
  sold_at: string;
  items: SaleLineRow[];
  payments: SalePaymentRow[];
  /** 0 until the server has acknowledged the command. The sale is real to the shop either way. */
  synced: number;
};

type SaleRowRaw = Omit<SaleRow, "items" | "payments"> & { items_json: string; payments_json: string };

function webRead(): SaleRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaleRow[];
    return Array.isArray(parsed) ? parsed.map(hydrate) : [];
  } catch {
    return [];
  }
}

function webWrite(rows: SaleRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

/** Malformed JSON means a sale with no lines, never a crash — the receipt still renders. */
export function parseSaleLines(value: unknown): SaleLineRow[] {
  const raw = toArray(value);
  const lines: SaleLineRow[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    const variant_id = typeof line.variant_id === "string" ? line.variant_id : "";
    if (!variant_id) continue;

    lines.push({
      id: typeof line.id === "string" && line.id ? line.id : variant_id,
      variant_id,
      quantity: formatQuantity(parseQuantity(line.quantity) ?? 0),
      unit_price: formatMoney(parseMoney(line.unit_price) ?? 0),
      discount: formatMoney(parseMoney(line.discount) ?? 0),
      tax: formatMoney(parseMoney(line.tax) ?? 0),
    });
  }
  return lines;
}

export function parseSalePayments(value: unknown): SalePaymentRow[] {
  const raw = toArray(value);
  const payments: SalePaymentRow[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const payment = item as Record<string, unknown>;
    const method = typeof payment.method === "string" ? payment.method : "";
    // An unrecognised method would be refused by the server anyway; dropping it here keeps a
    // corrupted row from rendering a receipt that claims it was paid for.
    if (!isPaymentMethod(method)) continue;

    payments.push({
      id: typeof payment.id === "string" && payment.id ? payment.id : method,
      method,
      amount: formatMoney(parseMoney(payment.amount) ?? 0),
      reference: typeof payment.reference === "string" && payment.reference ? payment.reference : null,
    });
  }
  return payments;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrate(row: SaleRow): SaleRow {
  return {
    ...row,
    items: parseSaleLines(row.items),
    payments: parseSalePayments(row.payments),
    synced: row.synced ? 1 : 0,
  };
}

function fromRaw(row: SaleRowRaw): SaleRow {
  const { items_json, payments_json, ...rest } = row;
  return {
    ...rest,
    items: parseSaleLines(items_json),
    payments: parseSalePayments(payments_json),
    synced: row.synced ? 1 : 0,
  };
}

export async function salesUpsert(row: {
  id: string;
  location_id: string;
  cashier_id?: string | null;
  status?: string | null;
  /** Recomputed from the lines when omitted, so a caller cannot store totals that disagree. */
  subtotal?: string | number | null;
  discount?: string | number | null;
  tax?: string | number | null;
  total_amount?: string | number | null;
  sold_at?: string | null;
  items?: unknown;
  payments?: unknown;
  synced?: boolean;
}) {
  const items = parseSaleLines(row.items);
  const derived = computeSaleTotals(items);
  const normalized: SaleRow = {
    id: row.id,
    location_id: row.location_id,
    cashier_id: row.cashier_id ?? null,
    status: row.status ?? "completed",
    subtotal: formatMoney(row.subtotal == null ? derived.subtotal : (parseMoney(row.subtotal) ?? 0)),
    discount: formatMoney(row.discount == null ? derived.discount : (parseMoney(row.discount) ?? 0)),
    tax: formatMoney(row.tax == null ? derived.tax : (parseMoney(row.tax) ?? 0)),
    total_amount: formatMoney(
      row.total_amount == null ? derived.total_amount : (parseMoney(row.total_amount) ?? 0)
    ),
    sold_at: row.sold_at ?? new Date().toISOString(),
    items,
    payments: parseSalePayments(row.payments),
    synced: row.synced ? 1 : 0,
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
    "INSERT INTO sales (id, location_id, cashier_id, status, subtotal, discount, tax, total_amount, sold_at, items_json, payments_json, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET location_id = excluded.location_id, cashier_id = excluded.cashier_id, status = excluded.status, subtotal = excluded.subtotal, discount = excluded.discount, tax = excluded.tax, total_amount = excluded.total_amount, sold_at = excluded.sold_at, items_json = excluded.items_json, payments_json = excluded.payments_json, synced = excluded.synced",
    [
      normalized.id,
      normalized.location_id,
      normalized.cashier_id,
      normalized.status,
      normalized.subtotal,
      normalized.discount,
      normalized.tax,
      normalized.total_amount,
      normalized.sold_at,
      JSON.stringify(normalized.items),
      JSON.stringify(normalized.payments),
      normalized.synced,
    ]
  );
}

/** Only ever used to drop a local row the server rejected — an applied sale is immutable. */
export async function salesDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((r) => r.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM sales WHERE id = ?", [id]);
}

export async function salesGetById(id: string): Promise<SaleRow | null> {
  if (Platform.OS === "web") return webRead().find((r) => r.id === id) ?? null;
  const db = await getDb();
  const row = await db.getFirstAsync<SaleRowRaw>("SELECT * FROM sales WHERE id = ? LIMIT 1", [id]);
  return row ? fromRaw(row) : null;
}

/** Newest first — the till's own history, which is all a receipt lookup needs offline. */
export async function salesList(limit = 50): Promise<SaleRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .slice()
      .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
      .slice(0, limit);
  }
  const db = await getDb();
  const rows = await db.getAllAsync<SaleRowRaw>("SELECT * FROM sales ORDER BY sold_at DESC LIMIT ?", [limit]);
  return rows.map(fromRaw);
}
