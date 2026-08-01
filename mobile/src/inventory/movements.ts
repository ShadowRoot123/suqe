import { getDb } from "@/db/db";
import { formatQuantity, quantityOrZero } from "@/inventory/lib/quantity";
import { Platform } from "react-native";

const WEB_KEY = "myshop.inventory_movements.v1";

export type MovementRow = {
  id: string;
  variant_id: string;
  location_id: string;
  type: string;
  quantity_delta: string;
  note: string | null;
  created_at: string;
  /** 0 until the server has acknowledged the command that produced this row. */
  synced: number;
};

function webRead(): MovementRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MovementRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: MovementRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function movementsUpsert(row: {
  id: string;
  variant_id: string;
  location_id: string;
  type?: string | null;
  quantity_delta: string | number;
  note?: string | null;
  created_at?: string;
  synced?: boolean;
}) {
  const normalized: MovementRow = {
    id: row.id,
    variant_id: row.variant_id,
    location_id: row.location_id,
    type: row.type ?? "adjustment",
    quantity_delta: formatQuantity(quantityOrZero(row.quantity_delta)),
    note: row.note ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
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
    "INSERT INTO inventory_movements (id, variant_id, location_id, type, quantity_delta, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET variant_id = excluded.variant_id, location_id = excluded.location_id, type = excluded.type, quantity_delta = excluded.quantity_delta, note = excluded.note, created_at = excluded.created_at, synced = excluded.synced",
    [
      normalized.id,
      normalized.variant_id,
      normalized.location_id,
      normalized.type,
      normalized.quantity_delta,
      normalized.note,
      normalized.created_at,
      normalized.synced,
    ]
  );
}

function sortNewestFirst(rows: MovementRow[]) {
  return rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function movementsListRecent(limit = 50): Promise<MovementRow[]> {
  if (Platform.OS === "web") {
    return sortNewestFirst(webRead()).slice(0, limit);
  }
  const db = await getDb();
  return await db.getAllAsync<MovementRow>("SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT ?", [limit]);
}

/**
 * Movements the server has not acknowledged yet — added on top of the snapshot cache. Adjustments
 * made offline, and the `purchase` rows a receipt writes before it syncs.
 */
export async function movementsListUnsynced(): Promise<MovementRow[]> {
  if (Platform.OS === "web") {
    return sortNewestFirst(webRead().filter((r) => !r.synced));
  }
  const db = await getDb();
  return await db.getAllAsync<MovementRow>("SELECT * FROM inventory_movements WHERE synced = 0 ORDER BY created_at DESC");
}

/** Only ever used to drop a local row the server rejected — applied movements are immutable. */
export async function movementsDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((r) => r.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM inventory_movements WHERE id = ?", [id]);
}

export async function movementsListByVariant(variantId: string, limit = 50): Promise<MovementRow[]> {
  if (Platform.OS === "web") {
    return sortNewestFirst(webRead().filter((r) => r.variant_id === variantId)).slice(0, limit);
  }
  const db = await getDb();
  return await db.getAllAsync<MovementRow>(
    "SELECT * FROM inventory_movements WHERE variant_id = ? ORDER BY created_at DESC LIMIT ?",
    [variantId, limit]
  );
}
