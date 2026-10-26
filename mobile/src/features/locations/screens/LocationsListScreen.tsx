import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React from "react";
import { RefreshControl, StyleSheet, View } from "react-native";

import { hasPermission } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { AppText, Badge, Button, Notice, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";
import { theme } from "@/ui/theme";

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <AppText muted style={{ flex: 1 }}>
            Shops and warehouses stock is counted against. Works offline — new locations sync on the next push.
          </AppText>
          {canWrite ? (
            <Button
              title="Add"
              left={<Ionicons name="add" size={18} color={theme.colors.primaryText} />}
              accessibilityLabel="Add location"
              onPress={() => router.push("/(tabs)/inventory/locations/create")}
            />
          ) : null}
        </View>

        {pendingCount > 0 ? (
          <Notice tone="warning">
            {pendingCount} {pendingCount === 1 ? "location is" : "locations are"} waiting to sync.
          </Notice>
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
          ]}
          rows={locations}
          getRowId={(l: LocationLine) => l.id}
          onRowPress={canWrite ? (l: LocationLine) => router.push(`/(tabs)/inventory/locations/${l.id}`) : undefined}
          renderMobileRow={(l: LocationLine) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.tile}>
                <Ionicons
                  name={l.type === "warehouse" ? "cube-outline" : "storefront-outline"}
                  size={20}
                  color={theme.colors.primaryStrong}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <AppText variant="h3">{l.name}</AppText>
                  {l.pending ? <Badge tone="warning" label="Unsynced" /> : null}
                </View>
                <AppText variant="caption">
                  {TYPE_LABEL[l.type] ?? l.type} · {l.address || "No address"}
                </AppText>
              </View>
            </View>
          )}
        />
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
});
