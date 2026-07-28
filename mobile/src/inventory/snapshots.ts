import { getDb } from "@/db/db";
import { formatQuantity, quantityOrZero } from "@/inventory/lib/quantity";
import { Platform } from "react-native";

const WEB_KEY = "myshop.inventory_snapshots.v1";

export type SnapshotRow = {
  variant_id: string;
  location_id: string;
  quantity: string;
  updated_at: string;
};

function webRead(): SnapshotRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SnapshotRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: SnapshotRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

function keyOf(variantId: string, locationId: string) {
  return `${variantId}::${locationId}`;
}

/**
 * Last known *server* on-hand. Offline adjustments deliberately do not touch this — they
 * live in the movement ledger until acknowledged, and onHand.ts adds them on top. That way
 * a refresh from the server can never drop work that has not synced yet.
 */
export async function snapshotsSet(args: {
  variant_id: string;
  location_id: string;
  quantity: string | number;
  updated_at?: string;
}) {
  const row: SnapshotRow = {
    variant_id: args.variant_id,
    location_id: args.location_id,
    quantity: formatQuantity(quantityOrZero(args.quantity)),
    updated_at: args.updated_at ?? new Date().toISOString(),
  };

  if (Platform.OS === "web") {
    const rows = webRead();
    const idx = rows.findIndex((r) => keyOf(r.variant_id, r.location_id) === keyOf(row.variant_id, row.location_id));
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    webWrite(rows);
    return;
  }

  const db = await getDb();
  await db.runAsync(
    "INSERT INTO inventory_snapshots (variant_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(variant_id, location_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at",
    [row.variant_id, row.location_id, row.quantity, row.updated_at]
  );
}

export async function snapshotsGet(variantId: string, locationId: string): Promise<SnapshotRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((r) => r.variant_id === variantId && r.location_id === locationId) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<SnapshotRow>(
    "SELECT * FROM inventory_snapshots WHERE variant_id = ? AND location_id = ? LIMIT 1",
    [variantId, locationId]
  );
  return row ?? null;
}

export async function snapshotsList(args?: { location_id?: string | null }): Promise<SnapshotRow[]> {
  const locationId = args?.location_id ?? null;

  if (Platform.OS === "web") {
    return webRead().filter((r) => (locationId ? r.location_id === locationId : true));
  }
  const db = await getDb();
  return locationId
    ? await db.getAllAsync<SnapshotRow>("SELECT * FROM inventory_snapshots WHERE location_id = ?", [locationId])
    : await db.getAllAsync<SnapshotRow>("SELECT * FROM inventory_snapshots");
}

