import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.product_groups.v1";

export type ProductGroupRow = { id: string; name: string; updated_at: string };

function webRead(): ProductGroupRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductGroupRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: ProductGroupRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function productGroupsUpsert(row: { id: string; name: string; updated_at?: string }) {
  const now = row.updated_at ?? new Date().toISOString();
  const normalized: ProductGroupRow = { id: row.id, name: row.name, updated_at: now };

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
    "INSERT INTO product_groups (id, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at",
    [normalized.id, normalized.name, normalized.updated_at]
  );
}

export async function productGroupsDelete(id: string) {
  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id !== id);
    webWrite(rows);
    const membershipsKey = "myshop.product_group_memberships.v1";
    try {
      const raw = globalThis.localStorage?.getItem(membershipsKey);
      const parsed = raw ? (JSON.parse(raw) as any[]) : [];
      const next = Array.isArray(parsed) ? parsed.filter((m) => m?.product_group_id !== id) : [];
      globalThis.localStorage?.setItem(membershipsKey, JSON.stringify(next));
    } catch {}
    return;
  }

  const db = await getDb();
  await db.runAsync("DELETE FROM product_group_memberships WHERE product_group_id = ?", [id]);
  await db.runAsync("DELETE FROM product_groups WHERE id = ?", [id]);
}

export async function productGroupsList(): Promise<ProductGroupRow[]> {
  if (Platform.OS === "web") {
    return webRead().slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  return await db.getAllAsync<ProductGroupRow>("SELECT * FROM product_groups ORDER BY updated_at DESC");
}

export async function productGroupsGetById(id: string): Promise<ProductGroupRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((g) => g.id === id) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<ProductGroupRow>("SELECT * FROM product_groups WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}

