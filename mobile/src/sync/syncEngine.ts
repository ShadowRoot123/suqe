import { apiForSession, SyncCommand } from "@/api/endpoints";
import { Session } from "@/auth/session";
import { kvGet, kvSet } from "@/db/kv";
import { getDeviceId } from "@/sync/device";
import { outboxListPending, outboxMarkStatusByIdempotencyKey } from "@/sync/outbox";

const CURSOR_KEY = "sync_cursor";

export async function getSyncCursor(): Promise<string | null> {
  return await kvGet(CURSOR_KEY);
}

async function setSyncCursor(next: string): Promise<void> {
  await kvSet(CURSOR_KEY, next);
}

export async function pushPending(session: Session) {
  const api = apiForSession(session);
  const deviceId = await getDeviceId();
  const pending = await outboxListPending(50);

  const commands: SyncCommand[] = pending.map((row) => ({
    idempotency_key: row.idempotency_key,
    entity: row.entity,
    operation: row.operation as any,
    payload: JSON.parse(row.payload),
  }));

  if (commands.length === 0) return { pushed: 0, outcomes: [] as any[] };

  const res = await api.syncPush({ device_id: deviceId, commands });

  for (const outcome of res.outcomes) {
    if (!outcome.idempotency_key) continue;
    if (outcome.status === "invalid") {
      await outboxMarkStatusByIdempotencyKey(outcome.idempotency_key, "rejected");
      continue;
    }
    await outboxMarkStatusByIdempotencyKey(outcome.idempotency_key, "enqueued");
  }

  return { pushed: commands.length, outcomes: res.outcomes };
}

export async function pullAcks(session: Session) {
  const api = apiForSession(session);
  const deviceId = await getDeviceId();
  const cursor = await getSyncCursor();

  const res = await api.syncPull({ device_id: deviceId, cursor, limit: 200 });
  await setSyncCursor(res.next_cursor);

  for (const ack of res.acks) {
    await outboxMarkStatusByIdempotencyKey(ack.idempotency_key, ack.status);
  }

  return { nextCursor: res.next_cursor, acks: res.acks.length, changes: res.changes.length };
}

export async function syncNow(session: Session) {
  const push = await pushPending(session);
  const pull = await pullAcks(session);
  return { push, pull };
}

