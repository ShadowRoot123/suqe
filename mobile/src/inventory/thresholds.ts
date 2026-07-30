import { getDb } from "@/db/db";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { Platform } from "react-native";

const WEB_KEY = "myshop.stock_thresholds.v1";

export type ThresholdRow = {
  id: string;
  variant_id: string;
  /** null is the variant-wide default; a row naming a location overrides it there. */
  location_id: string | null;
  reorder_point: string;
  reorder_quantity: string | null;
  updated_at: string;
};

function webRead(): ThresholdRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ThresholdRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: ThresholdRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

/** Matches the server's two partial unique indexes: one threshold per variant per location. */
function sameTarget(a: { variant_id: string; location_id: string | null }, b: { variant_id: string; location_id: string | null }) {
  return a.variant_id === b.variant_id && (a.location_id ?? null) === (b.location_id ?? null);
}

/**
 * Upserts by id and drops any other row aiming at the same variant+location. That collision is
 * routine rather than exceptional: two devices can each create a threshold for the same target,
 * and the server resolves them onto one row, so the loser's id arrives here as a stale duplicate.
 * It is enforced in code rather than with a unique index because the web store has no indexes and
 * both platforms have to behave identically.
 */
export async function thresholdsUpsert(row: {
  id: string;
  variant_id: string;
  location_id?: string | null;
  reorder_point: string | number;
  reorder_quantity?: string | number | null;
  updated_at?: string;
}) {
  const point = parseQuantity(row.reorder_point);
  const quantity = row.reorder_quantity == null ? null : parseQuantity(row.reorder_quantity);
  const normalized: ThresholdRow = {
    id: row.id,
    variant_id: row.variant_id,
    location_id: row.location_id ?? null,
    reorder_point: formatQuantity(point ?? 0),
    reorder_quantity: quantity === null ? null : formatQuantity(quantity),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };

  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id === normalized.id || !sameTarget(r, normalized));
    const idx = rows.findIndex((r) => r.id === normalized.id);
    if (idx >= 0) rows[idx] = normalized;
    else rows.push(normalized);
    webWrite(rows);
    return;
  }

  const db = await getDb();
  await db.runAsync("DELETE FROM stock_thresholds WHERE variant_id = ? AND IFNULL(location_id, '') = ? AND id <> ?", [
    normalized.variant_id,
    normalized.location_id ?? "",
    normalized.id,
  ]);
  await db.runAsync(
    "INSERT INTO stock_thresholds (id, variant_id, location_id, reorder_point, reorder_quantity, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET variant_id = excluded.variant_id, location_id = excluded.location_id, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, updated_at = excluded.updated_at",
    [
      normalized.id,
      normalized.variant_id,
      normalized.location_id,
      normalized.reorder_point,
      normalized.reorder_quantity,
      normalized.updated_at,
    ]
  );
}

export async function thresholdsDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((r) => r.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM stock_thresholds WHERE id = ?", [id]);
}

export async function thresholdsList(): Promise<ThresholdRow[]> {
  if (Platform.OS === "web") return webRead().slice();
  const db = await getDb();
  return await db.getAllAsync<ThresholdRow>("SELECT * FROM stock_thresholds");
}

export async function thresholdsGetById(id: string): Promise<ThresholdRow | null> {
  if (Platform.OS === "web") return webRead().find((r) => r.id === id) ?? null;
  const db = await getDb();
  const row = await db.getFirstAsync<ThresholdRow>("SELECT * FROM stock_thresholds WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}

/**
 * The row for exactly this target — not the one that *applies* there. The editor needs this to
 * decide between a create and an update; `effectiveThreshold` in lib/lowStock.ts is what the
 * display logic wants.
 */
export async function thresholdsFindTarget(variantId: string, locationId: string | null): Promise<ThresholdRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((r) => sameTarget(r, { variant_id: variantId, location_id: locationId })) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<ThresholdRow>(
    "SELECT * FROM stock_thresholds WHERE variant_id = ? AND IFNULL(location_id, '') = ? LIMIT 1",
    [variantId, locationId ?? ""]
  );
  return row ?? null;
}
