import { router, useFocusEffect } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { hasPermission } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { AppText, Badge, Button, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";

import { useSuppliersData, type SupplierLine } from "../hooks/useSuppliersData";

export default function SuppliersListScreen() {
  const { refreshing, refresh, readLocal, suppliers } = useSuppliersData();
  const { session } = useSession();
  const canWrite = hasPermission(session, "purchasing.write");

  // Coming back from the form should show the edit straight away, without a server round trip.
  useFocusEffect(
    React.useCallback(() => {
      void readLocal();
    }, [readLocal])
  );

  const pendingCount = suppliers.filter((s) => s.pending).length;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">Suppliers</AppText>
          {canWrite ? (
            <Button title="Add supplier" onPress={() => router.push("/(tabs)/purchasing/suppliers/create")} />
          ) : null}
        </View>

        <AppText muted>
          Who you buy from. Works offline — new suppliers sync on the next push.
        </AppText>

        {pendingCount > 0 ? (
          <AppText muted>
            {pendingCount} {pendingCount === 1 ? "supplier is" : "suppliers are"} waiting to sync.
          </AppText>
        ) : null}

        <DataTable
          emptyTitle="No suppliers yet"
          emptySubtitle="Add one before raising a purchase order."
          columns={[
            {
              key: "name",
              title: "Name",
              minWidth: 220,
              render: (s: SupplierLine) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <AppText>{s.name}</AppText>
                  {s.pending ? <Badge tone="warning" label="Unsynced" /> : null}
                </View>
              ),
              sortValue: (s: SupplierLine) => s.name,
            },
            {
              key: "phone",
              title: "Phone",
              minWidth: 150,
              render: (s: SupplierLine) => s.phone ?? "—",
              sortValue: (s: SupplierLine) => s.phone ?? "",
            },
            {
              key: "email",
              title: "Email",
              minWidth: 220,
              hideOnMobile: true,
              render: (s: SupplierLine) => s.email ?? "—",
              sortValue: (s: SupplierLine) => s.email ?? "",
            },
            {
              key: "orders",
              title: "Orders",
              minWidth: 110,
              hideOnMobile: true,
              render: (s: SupplierLine) => String(s.order_count),
              sortValue: (s: SupplierLine) => s.order_count,
            },
            {
              key: "actions",
              title: "",
              minWidth: 110,
              render: (s: SupplierLine) =>
                canWrite ? (
                  <Button
                    title="Edit"
                    variant="ghost"
                    onPress={() => router.push(`/(tabs)/purchasing/suppliers/${s.id}`)}
                  />
                ) : (
                  "—"
                ),
            },
          ]}
          rows={suppliers}
          getRowId={(s: SupplierLine) => s.id}
        />

        <Button title="Back to purchase orders" variant="ghost" onPress={() => router.push("/(tabs)/purchasing")} />
      </Stack>
    </Screen>
  );
}
