import { router, useFocusEffect } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { hasPermission } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { AppText, Badge, Button, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";

import { useLocationsData, type LocationLine } from "../hooks/useLocationsData";

const TYPE_LABEL: Record<string, string> = { shop: "Shop", warehouse: "Warehouse" };

export default function LocationsListScreen() {
  const { refreshing, refresh, readLocal, locations } = useLocationsData();
  const { session } = useSession();
  const canWrite = hasPermission(session, "locations.write");

  // Coming back from the form should show the edit straight away, without a server round trip.
  useFocusEffect(
    React.useCallback(() => {
      void readLocal();
    }, [readLocal])
  );

  const pendingCount = locations.filter((l) => l.pending).length;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">Locations</AppText>
          {canWrite ? (
            <Button title="Add location" onPress={() => router.push("/(tabs)/inventory/locations/create")} />
          ) : null}
        </View>

        <AppText muted>
          Shops and warehouses stock is counted against. Works offline — new locations sync on the next push.
        </AppText>

        {pendingCount > 0 ? (
          <AppText muted>
            {pendingCount} {pendingCount === 1 ? "location is" : "locations are"} waiting to sync.
          </AppText>
        ) : null}

        <DataTable
          emptyTitle="No locations yet"
          emptySubtitle="Add a shop or warehouse before adjusting stock."
          columns={[
            {
              key: "name",
              title: "Name",
              minWidth: 220,
              render: (l: LocationLine) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <AppText>{l.name}</AppText>
                  {l.pending ? <Badge tone="warning" label="Unsynced" /> : null}
                </View>
              ),
              sortValue: (l: LocationLine) => l.name,
            },
            {
              key: "type",
              title: "Type",
              minWidth: 140,
              render: (l: LocationLine) => TYPE_LABEL[l.type] ?? l.type,
              sortValue: (l: LocationLine) => l.type,
            },
            {
              key: "address",
              title: "Address",
              minWidth: 220,
              hideOnMobile: true,
              render: (l: LocationLine) => l.address ?? "—",
              sortValue: (l: LocationLine) => l.address ?? "",
            },
            {
              key: "actions",
              title: "",
              minWidth: 110,
              render: (l: LocationLine) =>
                canWrite ? (
                  <Button
                    title="Edit"
                    variant="ghost"
                    onPress={() => router.push(`/(tabs)/inventory/locations/${l.id}`)}
                  />
                ) : (
                  "—"
                ),
            },
          ]}
          rows={locations}
          getRowId={(l: LocationLine) => l.id}
        />
      </Stack>
    </Screen>
  );
}
