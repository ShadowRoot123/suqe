import React from "react";

import { useSession } from "@/auth/session";
import { refreshPurchasingFromServer } from "@/purchasing/bootstrapPurchasing";
import { ordersList } from "@/purchasing/orders";
import { suppliersList, type SupplierRow } from "@/purchasing/suppliers";
import { outboxUnsettledEntityIds } from "@/sync/outbox";

export type SupplierLine = SupplierRow & {
  pending: boolean;
  /** Orders this device knows about — the server refuses to delete a supplier with any. */
  order_count: number;
};

/**
 * Suppliers read from the local store first so the screen works offline; the REST refresh is best
 * effort and skips rows whose edits have not been acknowledged yet. Mirrors useLocationsData.
 */
export function useSuppliersData() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = React.useState(false);
  const [suppliers, setSuppliers] = React.useState<SupplierLine[]>([]);

  const readLocal = React.useCallback(async () => {
    const [rows, orders, inFlight] = await Promise.all([
      suppliersList(),
      ordersList(),
      outboxUnsettledEntityIds("supplier"),
    ]);

    const orderCounts = new Map<string, number>();
    for (const order of orders) {
      orderCounts.set(order.supplier_id, (orderCounts.get(order.supplier_id) ?? 0) + 1);
    }

    setSuppliers(
      rows.map((row) => ({
        ...row,
        pending: inFlight.has(row.id),
        order_count: orderCounts.get(row.id) ?? 0,
      }))
    );
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      if (session) {
        try {
          await refreshPurchasingFromServer(session);
        } catch {
          // offline, or no purchasing permission — local data still renders
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

  return { refreshing, refresh, readLocal, suppliers };
}
