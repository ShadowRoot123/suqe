import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

export type SqlDatabase = SQLiteDatabase;

let dbPromise: Promise<SqlDatabase> | null = null;
const SCHEMA_VERSION = 10;

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

  if (current < 4) {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS product_groups (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, variant_options_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"
    );
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS product_group_memberships (id TEXT PRIMARY KEY NOT NULL, product_group_id TEXT NOT NULL, product_id TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_product_groups_name ON product_groups (name)");
    await db.execAsync(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_pg_memberships_unique ON product_group_memberships (product_group_id, product_id)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_pg_memberships_group ON product_group_memberships (product_group_id)");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_pg_memberships_product ON product_group_memberships (product_id)");
    current = 4;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 5) {
    try {
      await db.execAsync("ALTER TABLE product_groups ADD COLUMN variant_options_json TEXT NOT NULL DEFAULT '{}'");
    } catch {}
    current = 5;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 6) {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, address TEXT, updated_at TEXT NOT NULL)"
    );
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS inventory_movements (id TEXT PRIMARY KEY NOT NULL, variant_id TEXT NOT NULL, location_id TEXT NOT NULL, type TEXT NOT NULL, quantity_delta TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0)"
    );
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS inventory_snapshots (variant_id TEXT NOT NULL, location_id TEXT NOT NULL, quantity TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (variant_id, location_id))"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name)");
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_inv_movements_variant ON inventory_movements (variant_id, location_id, created_at DESC)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_inv_movements_created ON inventory_movements (created_at DESC)");
    current = 6;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 7) {
    // location_id NULL is the variant-wide default. Uniqueness per variant+location is enforced
    // in thresholds.ts rather than here, because the web store has no indexes and a pull can
    // legitimately hand us a row whose id replaces a local one aimed at the same target.
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS stock_thresholds (id TEXT PRIMARY KEY NOT NULL, variant_id TEXT NOT NULL, location_id TEXT, reorder_point TEXT NOT NULL, reorder_quantity TEXT, updated_at TEXT NOT NULL)"
    );
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_stock_thresholds_variant ON stock_thresholds (variant_id, location_id)"
    );
    current = 7;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 8) {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, updated_at TEXT NOT NULL)"
    );
    // An order's lines sit in items_json rather than a second table: they only ever travel with
    // their header (one sync command, one screen), nothing queries across them, and one column
    // keeps the write atomic on both platforms — see purchasing/orders.ts.
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY NOT NULL, supplier_id TEXT NOT NULL, location_id TEXT NOT NULL, status TEXT NOT NULL, expected_at TEXT, total_cost TEXT NOT NULL, created_by TEXT, items_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name)");
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status, updated_at DESC)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders (supplier_id)");
    current = 8;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 9) {
    // Receipt lines sit in items_json for the same reason an order's do: they only ever travel
    // with their header, and one column keeps the write atomic on both platforms.
    // `synced` mirrors inventory_movements — a receipt made offline is real to this device
    // before the server has seen it, and that is what the outstanding quantity is computed from.
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS purchase_receipts (id TEXT PRIMARY KEY NOT NULL, purchase_order_id TEXT NOT NULL, received_at TEXT NOT NULL, received_by TEXT, items_json TEXT NOT NULL DEFAULT '[]', synced INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"
    );
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_purchase_receipts_order ON purchase_receipts (purchase_order_id, received_at DESC)"
    );
    current = 9;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current < 10) {
    // Lines and payments both sit in JSON columns for the same reason an order's lines do: they
    // only ever travel with their sale (one command, one receipt), nothing queries across them,
    // and one row keeps the write atomic on both platforms.
    // `synced` mirrors inventory_movements — a sale made offline is real to the shop before the
    // server has seen it, and the receipt has to render either way.
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY NOT NULL, location_id TEXT NOT NULL, cashier_id TEXT, status TEXT NOT NULL DEFAULT 'completed', subtotal TEXT NOT NULL DEFAULT '0.00', discount TEXT NOT NULL DEFAULT '0.00', tax TEXT NOT NULL DEFAULT '0.00', total_amount TEXT NOT NULL DEFAULT '0.00', sold_at TEXT NOT NULL, items_json TEXT NOT NULL DEFAULT '[]', payments_json TEXT NOT NULL DEFAULT '[]', synced INTEGER NOT NULL DEFAULT 0)"
    );
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales (sold_at DESC)");
    current = 10;
    await db.execAsync(`PRAGMA user_version = ${current}`);
  }

  if (current != SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}
