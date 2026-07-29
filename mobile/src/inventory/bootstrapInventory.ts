import { apiForSession } from "@/api/endpoints";
import type { Session } from "@/auth/session";
import { kvGet, kvSet } from "@/db/kv";
import { locationsUpsert } from "@/inventory/locations";
import { snapshotsSet } from "@/inventory/snapshots";
import { outboxUnsettledEntityIds } from "@/sync/outbox";

function bootKey(orgId: string) {
  return `inventory_bootstrap_v1.${orgId}`;
}

/**
 * The pull feed only carries changes since the cursor, so a fresh device would never see
 * locations or stock that predate it. Both are seeded from REST once per org; after that the
 * pull feed keeps them current.
 */
export async function bootstrapInventoryIfNeeded(session: Session) {
  const existing = await kvGet(bootKey(session.orgId));
  if (existing) return;

  await refreshInventoryFromServer(session);
  await kvSet(bootKey(session.orgId), new Date().toISOString());
}

/** Best-effort online refresh; safe to call from pull-to-refresh while offline. */
export async function refreshInventoryFromServer(session: Session) {
  const api = apiForSession(session);

  // A location the user just created, renamed or deleted offline is ahead of the server's copy
  // until its command is acknowledged, so REST must not write over it.
  const inFlight = await outboxUnsettledEntityIds("location");

  const locations = await api.locationsIndex();
  for (const location of locations.locations) {
    if (inFlight.has(location.id)) continue;
    await locationsUpsert({
      id: location.id,
      name: location.name,
      type: location.type,
      address: location.address,
      updated_at: location.updated_at,
    });
  }

  const snapshots = await api.inventorySnapshotsIndex();
  for (const snapshot of snapshots.inventory_snapshots) {
    await snapshotsSet({
      variant_id: snapshot.variant_id,
      location_id: snapshot.location_id,
      quantity: snapshot.quantity,
      updated_at: snapshot.updated_at,
    });
  }
}
