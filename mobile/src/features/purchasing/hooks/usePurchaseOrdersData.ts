import React from "react";

import { useSession } from "@/auth/session";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { refreshPurchasingFromServer } from "@/purchasing/bootstrapPurchasing";
import { type OrderStatus } from "@/purchasing/lib/orderLifecycle";
import { ordersList, type OrderRow } from "@/purchasing/orders";
import { suppliersList, type SupplierRow } from "@/purchasing/suppliers";
import { outboxUnsettledEntityIds } from "@/sync/outbox";

export type OrderLine = OrderRow & {
  supplier_name: string;
  location_name: string;
  pending: boolean;
  line_count: number;
};

/**
 * Orders read from the local store first so the list works offline; the REST refresh is best effort
 * and skips rows whose edits have not been acknowledged yet.
 */
export function usePurchaseOrdersData() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = React.useState(false);
  const [orders, setOrders] = React.useState<OrderLine[]>([]);
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [locations, setLocations] = React.useState<LocationRow[]>([]);

  const readLocal = React.useCallback(async () => {
    const [rows, supplierRows, locationRows, inFlight] = await Promise.all([
      ordersList(),
      suppliersList(),
      locationsList(),
      outboxUnsettledEntityIds("purchase_order"),
    ]);

    const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));
    const locationNameById = new Map(locationRows.map((l) => [l.id, l.name]));

    setSuppliers(supplierRows);
    setLocations(locationRows);
    setOrders(
      rows.map((row) => ({
        ...row,
        supplier_name: supplierNameById.get(row.supplier_id) ?? "Unknown supplier",
        location_name: locationNameById.get(row.location_id) ?? "Unknown location",
        pending: inFlight.has(row.id),
        line_count: row.items.length,
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

  const countsByStatus = React.useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    for (const order of orders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    return counts;
  }, [orders]);

  return { refreshing, refresh, readLocal, orders, suppliers, locations, countsByStatus };
}
