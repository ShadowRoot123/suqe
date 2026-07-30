import { router, useFocusEffect } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { hasPermission } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { calendarDate } from "@/purchasing/lib/calendarDate";
import { formatMoney, moneyOrZero } from "@/purchasing/lib/money";
import { ORDER_STATUSES, STATUS_LABEL, STATUS_TONE, type OrderStatus } from "@/purchasing/lib/orderLifecycle";
import { AppText, Badge, Button, Chip, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";

import { usePurchaseOrdersData, type OrderLine } from "../hooks/usePurchaseOrdersData";

const ALL = "__all__";

export default function PurchaseOrdersListScreen() {
  const { refreshing, refresh, readLocal, orders, countsByStatus } = usePurchaseOrdersData();
  const { session } = useSession();
  const canWrite = hasPermission(session, "purchasing.write");

  const [statusFilter, setStatusFilter] = React.useState<OrderStatus | typeof ALL>(ALL);

  useFocusEffect(
    React.useCallback(() => {
      void readLocal();
    }, [readLocal])
  );

  const visible = React.useMemo(
    () => (statusFilter === ALL ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter]
  );

  const pendingCount = orders.filter((o) => o.pending).length;
  const outstanding = orders
    .filter((o) => o.status === "approved" || o.status === "partially_received")
    .reduce((sum, o) => sum + moneyOrZero(o.total_cost), 0);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <AppText variant="h1">Purchase orders</AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button title="Suppliers" variant="ghost" onPress={() => router.push("/(tabs)/purchasing/suppliers")} />
            {canWrite ? <Button title="New order" onPress={() => router.push("/(tabs)/purchasing/create")} /> : null}
          </View>
        </View>

        <AppText muted>
          What you have ordered from your suppliers. Works offline — a new order syncs on the next push.
        </AppText>

        {outstanding > 0 ? (
          <AppText muted>{formatMoney(outstanding)} is on order and not yet fully received.</AppText>
        ) : null}
        {pendingCount > 0 ? (
          <AppText muted>
            {pendingCount} {pendingCount === 1 ? "order is" : "orders are"} waiting to sync.
          </AppText>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip label={`All (${orders.length})`} selected={statusFilter === ALL} onPress={() => setStatusFilter(ALL)} />
          {ORDER_STATUSES.filter((status) => (countsByStatus.get(status) ?? 0) > 0).map((status) => (
            <Chip
              key={status}
              label={`${STATUS_LABEL[status]} (${countsByStatus.get(status)})`}
              selected={statusFilter === status}
              onPress={() => setStatusFilter(status)}
            />
          ))}
        </View>

        <DataTable
          emptyTitle={statusFilter === ALL ? "No purchase orders yet" : `No ${STATUS_LABEL[statusFilter].toLowerCase()} orders`}
          emptySubtitle={
            statusFilter === ALL
              ? "Raise one to record what you have ordered from a supplier."
              : "Clear the filter to see the rest."
          }
          onRowPress={(o: OrderLine) => router.push(`/(tabs)/purchasing/${o.id}`)}
          columns={[
            {
              key: "supplier",
              title: "Supplier",
              minWidth: 200,
              render: (o: OrderLine) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <AppText>{o.supplier_name}</AppText>
                  {o.pending ? <Badge tone="warning" label="Unsynced" /> : null}
                </View>
              ),
              sortValue: (o: OrderLine) => o.supplier_name,
            },
            {
              key: "status",
              title: "Status",
              minWidth: 150,
              render: (o: OrderLine) => <Badge tone={STATUS_TONE[o.status]} label={STATUS_LABEL[o.status]} />,
              sortValue: (o: OrderLine) => o.status,
            },
            {
              key: "location",
              title: "Deliver to",
              minWidth: 170,
              hideOnMobile: true,
              render: (o: OrderLine) => o.location_name,
              sortValue: (o: OrderLine) => o.location_name,
            },
            {
              key: "lines",
              title: "Lines",
              minWidth: 90,
              hideOnMobile: true,
              render: (o: OrderLine) => String(o.line_count),
              sortValue: (o: OrderLine) => o.line_count,
            },
            {
              key: "expected",
              title: "Expected",
              minWidth: 130,
              hideOnMobile: true,
              render: (o: OrderLine) => calendarDate(o.expected_at),
              sortValue: (o: OrderLine) => o.expected_at ?? "",
            },
            {
              key: "total",
              title: "Total",
              minWidth: 120,
              render: (o: OrderLine) => o.total_cost,
              sortValue: (o: OrderLine) => moneyOrZero(o.total_cost),
            },
          ]}
          rows={visible}
          getRowId={(o: OrderLine) => o.id}
        />
      </Stack>
    </Screen>
  );
}
