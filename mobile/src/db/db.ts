import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

export type SqlDatabase = SQLiteDatabase;

let dbPromise: Promise<SqlDatabase> | null = null;

export async function getDb(): Promise<SqlDatabase> {
  if (!dbPromise) dbPromise = openDatabaseAsync("myshop.db");
  return dbPromise;
}

export async function migrate() {
  if (Platform.OS === "web") return;
  const db = await getDb();
  await db.execAsync("PRAGMA foreign_keys = ON");
  await db.execAsync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE, entity TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
  );
}
