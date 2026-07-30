import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.suppliers.v1";

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  updated_at: string;
};

function webRead(): SupplierRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupplierRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: SupplierRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function suppliersUpsert(row: {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  updated_at?: string;
}) {
  const normalized: SupplierRow = {
    id: row.id,
    name: row.name,
    phone: blankToNull(row.phone),
    email: blankToNull(row.email),
    address: blankToNull(row.address),
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
    "INSERT INTO suppliers (id, name, phone, email, address, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone, email = excluded.email, address = excluded.address, updated_at = excluded.updated_at",
    [normalized.id, normalized.name, normalized.phone, normalized.email, normalized.address, normalized.updated_at]
  );
}

export async function suppliersDelete(id: string) {
  if (Platform.OS === "web") {
    webWrite(webRead().filter((s) => s.id !== id));
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM suppliers WHERE id = ?", [id]);
}

export async function suppliersList(): Promise<SupplierRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return await db.getAllAsync<SupplierRow>("SELECT * FROM suppliers ORDER BY name ASC");
}

export async function suppliersGetById(id: string): Promise<SupplierRow | null> {
  if (Platform.OS === "web") return webRead().find((s) => s.id === id) ?? null;
  const db = await getDb();
  const row = await db.getFirstAsync<SupplierRow>("SELECT * FROM suppliers WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}
