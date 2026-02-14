import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.product_group_memberships.v1";

export type ProductGroupMembershipRow = {
  id: string;
  product_group_id: string;
  product_id: string;
  updated_at: string;
};

function webRead(): ProductGroupMembershipRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductGroupMembershipRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: ProductGroupMembershipRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export async function productGroupMembershipsUpsert(row: {
  id: string;
  product_group_id: string;
  product_id: string;
  updated_at?: string;
}) {
  const now = row.updated_at ?? new Date().toISOString();
  const normalized: ProductGroupMembershipRow = {
    id: row.id,
    product_group_id: row.product_group_id,
    product_id: row.product_id,
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
    "INSERT INTO product_group_memberships (id, product_group_id, product_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET product_group_id = excluded.product_group_id, product_id = excluded.product_id, updated_at = excluded.updated_at",
    [normalized.id, normalized.product_group_id, normalized.product_id, normalized.updated_at]
  );
}

export async function productGroupMembershipsDelete(id: string) {
  if (Platform.OS === "web") {
    const rows = webRead().filter((r) => r.id !== id);
    webWrite(rows);
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM product_group_memberships WHERE id = ?", [id]);
}

export async function productGroupMembershipsListByGroup(productGroupId: string): Promise<ProductGroupMembershipRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .filter((m) => m.product_group_id === productGroupId)
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  return await db.getAllAsync<ProductGroupMembershipRow>(
    "SELECT * FROM product_group_memberships WHERE product_group_id = ? ORDER BY updated_at DESC",
    [productGroupId]
  );
}

export async function productGroupMembershipsListByProduct(productId: string): Promise<ProductGroupMembershipRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .filter((m) => m.product_id === productId)
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const db = await getDb();
  return await db.getAllAsync<ProductGroupMembershipRow>(
    "SELECT * FROM product_group_memberships WHERE product_id = ? ORDER BY updated_at DESC",
    [productId]
  );
}

export async function productGroupMembershipsFind(groupId: string, productId: string): Promise<ProductGroupMembershipRow | null> {
  if (Platform.OS === "web") {
    return webRead().find((m) => m.product_group_id === groupId && m.product_id === productId) ?? null;
  }
  const db = await getDb();
  const row = await db.getFirstAsync<ProductGroupMembershipRow>(
    "SELECT * FROM product_group_memberships WHERE product_group_id = ? AND product_id = ? LIMIT 1",
    [groupId, productId]
  );
  return row ?? null;
}

