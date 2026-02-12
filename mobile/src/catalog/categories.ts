import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.categories.v1";

export type CategoryRow = { id: string; name: string; parent_id: string | null; updated_at: string };

function webRead(): CategoryRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CategoryRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: CategoryRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function categoriesList(): Promise<CategoryRow[]> {
  if (Platform.OS === "web") {
    return webRead().slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return await db.getAllAsync<CategoryRow>("SELECT * FROM categories ORDER BY name ASC");
}

export async function categoriesUpsert(row: { id: string; name: string; parent_id?: string | null; updated_at?: string }) {
  const now = row.updated_at ?? new Date().toISOString();
  const normalized: CategoryRow = {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id ?? null,
    updated_at: now,
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
    "INSERT INTO categories (id, name, parent_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, updated_at = excluded.updated_at",
    [normalized.id, normalized.name, normalized.parent_id, normalized.updated_at]
  );
}

export async function categoriesDelete(id: string) {
  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id !== id);
    webWrite(rows);
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM categories WHERE id = ?", [id]);
}

