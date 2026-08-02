import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_PREFIX = "myshop.kv.";

export async function kvGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      const v = globalThis.localStorage?.getItem(`${WEB_PREFIX}${key}`) ?? null;
      return v;
    } catch {
      return null;
    }
  }
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ? LIMIT 1", [key]);
  return row?.value ?? null;
}

export async function kvDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(`${WEB_PREFIX}${key}`);
    } catch {}
    return;
  }
  const db = await getDb();
  await db.runAsync("DELETE FROM kv WHERE key = ?", [key]);
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(`${WEB_PREFIX}${key}`, value);
    } catch {}
    return;
  }
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
