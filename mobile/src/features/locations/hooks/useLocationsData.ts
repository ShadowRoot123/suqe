import React from "react";

import { useSession } from "@/auth/session";
import { refreshInventoryFromServer } from "@/inventory/bootstrapInventory";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { outboxUnsettledEntityIds } from "@/sync/outbox";

export type LocationLine = LocationRow & { pending: boolean };

/**
 * Locations read from the local store first so the screen works offline; the REST refresh is
 * best effort and skips rows whose edits have not been acknowledged yet.
 */
export function useLocationsData() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = React.useState(false);
  const [locations, setLocations] = React.useState<LocationLine[]>([]);

  const readLocal = React.useCallback(async () => {
    const [rows, inFlight] = await Promise.all([locationsList(), outboxUnsettledEntityIds("location")]);
    setLocations(rows.map((row) => ({ ...row, pending: inFlight.has(row.id) })));
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      if (session) {
        try {
          await refreshInventoryFromServer(session);
        } catch {
          // offline, or no inventory permission — local data still renders
        }
      }
      await readLocal();
    } finally {
      setRefreshing(false);
    }
  }, [readLocal, session]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { refreshing, refresh, readLocal, locations };
}
