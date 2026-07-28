import { apiForSession } from "@/api/endpoints";
import type { Session } from "@/auth/session";
import { kvGet, kvSet } from "@/db/kv";
import { locationsUpsert } from "@/inventory/locations";
import { snapshotsSet } from "@/inventory/snapshots";

function bootKey(orgId: string) {
  return `inventory_bootstrap_v1.${orgId}`;
}

/**
 * Locations are not a sync entity yet and the ledger predates this device, so both are
 * seeded from REST once per org. After that the pull feed keeps on-hand current.
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

  const locations = await api.locationsIndex();
  for (const location of locations.locations) {
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
