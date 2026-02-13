import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.products.v1";

export type ProductRow = { id: string; name: string; category_id: string | null; status: string; updated_at: string };

function webRead(): ProductRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: ProductRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function productsUpsert(row: {
  id: string;
  name: string;
  category_id?: string | null;
  status?: string;
  updated_at?: string;
}) {
  const now = row.updated_at ?? new Date().toISOString();
  const normalized: ProductRow = {
    id: row.id,
    name: row.name,
    category_id: row.category_id ?? null,
    status: row.status ?? "active",
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
    "INSERT INTO products (id, name, category_id, status, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category_id = excluded.category_id, status = excluded.status, updated_at = excluded.updated_at",
    [normalized.id, normalized.name, normalized.category_id, normalized.status, normalized.updated_at]
  );
}

export async function productsDelete(id: string) {
  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id !== id);
    webWrite(rows);
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM products WHERE id = ?", [id]);
}

export async function productsList(): Promise<ProductRow[]> {
  if (Platform.OS === "web") {
    return webRead().slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  return await db.getAllAsync<ProductRow>("SELECT * FROM products ORDER BY updated_at DESC");
}

export async function productsGetById(id: string): Promise<ProductRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((p) => p.id === id) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<ProductRow>("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}
