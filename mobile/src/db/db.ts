import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

export type SqlDatabase = SQLiteDatabase;

let dbPromise: Promise<SqlDatabase> | null = null;
const SCHEMA_VERSION = 3;

export async function getDb(): Promise<SqlDatabase> {
  if (!dbPromise) dbPromise = openDatabaseAsync("myshop.db");
  return dbPromise;
}

export async function migrate() {
  if (Platform.OS === "web") return;
  const db = await getDb();
  await db.execAsync("PRAGMA foreign_keys = ON");

  const rows = await db.getAllAsync<{ user_version: number }>("PRAGMA user_version");
  let current = rows?.[0]?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE, entity TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
    current = 1;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 2) {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, parent_id TEXT, updated_at TEXT NOT NULL)"
    );
    current = 2;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 3) {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, category_id TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS variants (id TEXT PRIMARY KEY NOT NULL, product_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT, attrs_json TEXT NOT NULL, price TEXT NOT NULL, cost_price TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants (sku)");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants (barcode)");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants (product_id)");
    current = 3;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current != SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}
