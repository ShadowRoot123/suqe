import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.locations.v1";

export type LocationRow = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  updated_at: string;
};

function webRead(): LocationRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocationRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: LocationRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function locationsUpsert(row: {
  id: string;
  name: string;
  type?: string | null;
  address?: string | null;
  updated_at?: string;
}) {
  const normalized: LocationRow = {
    id: row.id,
    name: row.name,
    type: row.type ?? "shop",
    address: row.address ?? null,
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
    "INSERT INTO locations (id, name, type, address, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, address = excluded.address, updated_at = excluded.updated_at",
    [normalized.id, normalized.name, normalized.type, normalized.address, normalized.updated_at]
  );
}

export async function locationsDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((l) => l.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM locations WHERE id = ?", [id]);
}

export async function locationsList(): Promise<LocationRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return await db.getAllAsync<LocationRow>("SELECT * FROM locations ORDER BY name ASC");
}

export async function locationsGetById(id: string): Promise<LocationRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((l) => l.id === id) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<LocationRow>("SELECT * FROM locations WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}
