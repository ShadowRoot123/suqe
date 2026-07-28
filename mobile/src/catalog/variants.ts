import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.variants.v1";

export type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  attrs_json: string;
  price: string;
  cost_price: string;
  updated_at: string;
};

function webRead(): VariantRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VariantRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: VariantRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function variantsUpsert(row: {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string | null;
  attrs?: unknown;
  price?: string | number | null;
  cost_price?: string | number | null;
  updated_at?: string;
}) {
  const now = row.updated_at ?? new Date().toISOString();
  const normalized: VariantRow = {
    id: row.id,
    product_id: row.product_id,
    sku: row.sku,
    barcode: row.barcode ?? null,
    attrs_json: JSON.stringify(row.attrs ?? {}),
    price: row.price == null ? "0" : String(row.price),
    cost_price: row.cost_price == null ? "0" : String(row.cost_price),
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
    "INSERT INTO variants (id, product_id, sku, barcode, attrs_json, price, cost_price, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, sku = excluded.sku, barcode = excluded.barcode, attrs_json = excluded.attrs_json, price = excluded.price, cost_price = excluded.cost_price, updated_at = excluded.updated_at",
    [
      normalized.id,
      normalized.product_id,
      normalized.sku,
      normalized.barcode,
      normalized.attrs_json,
      normalized.price,
      normalized.cost_price,
      normalized.updated_at,
    ]
  );
}

export async function variantsDelete(id: string) {
  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id !== id);
    webWrite(rows);
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM variants WHERE id = ?", [id]);
}

export async function variantsListByProduct(productId: string): Promise<VariantRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .filter((v) => v.product_id === productId)
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  return await db.getAllAsync<VariantRow>("SELECT * FROM variants WHERE product_id = ? ORDER BY updated_at DESC", [productId]);
}

export async function variantsListAll(): Promise<VariantRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .slice()
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }
  const db = await getDb();
  return await db.getAllAsync<VariantRow>("SELECT * FROM variants ORDER BY sku ASC");
}

export async function variantsGetById(id: string): Promise<VariantRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((v) => v.id === id) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<VariantRow>("SELECT * FROM variants WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}

export async function variantsSearch(query: string, limit = 20): Promise<(VariantRow & { product_name: string | null })[]> {
  const q = query.trim();
  if (!q) return [];

  if (Platform.OS === "web") {
    const variants = webRead();
    const productsRaw = globalThis.localStorage?.getItem("myshop.products.v1");
    const products = productsRaw ? (JSON.parse(productsRaw) as any[]) : [];
    const byProductId = new Map<string, string>();
    for (const p of products) {
      if (p?.id && p?.name) byProductId.set(String(p.id), String(p.name));
    }
    const needle = q.toLowerCase();
    return variants
      .filter((v) => {
        const name = byProductId.get(v.product_id)?.toLowerCase() ?? "";
        return (
          v.sku.toLowerCase().includes(needle) ||
          (v.barcode?.toLowerCase().includes(needle) ?? false) ||
          name.includes(needle)
        );
      })
      .slice(0, limit)
      .map((v) => ({ ...v, product_name: byProductId.get(v.product_id) ?? null }));
  }

  const db = await getDb();
  const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  return await db.getAllAsync<(VariantRow & { product_name: string | null })>(
    "SELECT v.*, p.name as product_name FROM variants v LEFT JOIN products p ON p.id = v.product_id WHERE v.sku LIKE ? ESCAPE '\\' OR v.barcode LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' ORDER BY v.updated_at DESC LIMIT ?",
    [like, like, like, limit]
  );
}
