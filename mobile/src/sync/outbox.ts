import { getDb } from "@/db/db";
import { Platform } from "react-native";

const WEB_KEY = "myshop.outbox.v1";

function webRead(): OutboxRow[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(rows: OutboxRow[]) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(rows));
  } catch {}
}

export type OutboxStatus = "pending" | "enqueued" | "applied" | "failed" | "rejected";

export type OutboxRow = {
  id: number;
  idempotency_key: string;
  entity: string;
  operation: string;
  payload: string;
  status: OutboxStatus;
  created_at: string;
  updated_at: string;
};

export async function outboxCount(status?: OutboxStatus) {
  if (Platform.OS === "web") {
    const rows = webRead();
    return status ? rows.filter((r) => r.status === status).length : rows.length;
  }
  const db = await getDb();
  const sql = status ? "SELECT COUNT(*) as c FROM outbox WHERE status = ?" : "SELECT COUNT(*) as c FROM outbox";
  const row = await db.getFirstAsync<{ c: number }>(sql, status ? [status] : []);
  return row?.c ?? 0;
}

export async function outboxListPending(limit = 50): Promise<OutboxRow[]> {
  if (Platform.OS === "web") {
    return webRead()
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }
  const db = await getDb();
  return await db.getAllAsync<OutboxRow>(
    "SELECT * FROM outbox WHERE status IN ('pending') ORDER BY id ASC LIMIT ?",
    [limit]
  );
}

export async function outboxEnqueue(args: { idempotencyKey: string; entity: string; operation: string; payload: unknown }) {
  if (Platform.OS === "web") {
    const rows = webRead();
    if (rows.some((r) => r.idempotency_key === args.idempotencyKey)) return;
    const now = new Date().toISOString();
    const nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
    rows.push({
      id: nextId,
      idempotency_key: args.idempotencyKey,
      entity: args.entity,
      operation: args.operation,
      payload: JSON.stringify(args.payload ?? {}),
      status: "pending",
      created_at: now,
      updated_at: now,
    });
    webWrite(rows);
    return;
  }
  const db = await getDb();
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(args.payload ?? {});
  await db.runAsync(
    "INSERT INTO outbox (idempotency_key, entity, operation, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(idempotency_key) DO NOTHING",
    [args.idempotencyKey, args.entity, args.operation, payloadJson, now, now]
  );
}

export async function outboxMarkStatusByIdempotencyKey(idempotencyKey: string, status: OutboxStatus) {
  if (Platform.OS === "web") {
    const rows = webRead();
    const now = new Date().toISOString();
    for (const r of rows) {
      if (r.idempotency_key === idempotencyKey) {
        r.status = status;
        r.updated_at = now;
      }
    }
    webWrite(rows);
    return;
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync("UPDATE outbox SET status = ?, updated_at = ? WHERE idempotency_key = ?", [
    status,
    now,
    idempotencyKey,
  ]);
}
