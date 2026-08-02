import { router, useFocusEffect } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { locationsList } from "@/inventory/locations";
import { salesList, type SaleRow } from "@/sales/sales";
import { AppText, Badge, Button, Card, Screen, Stack } from "@/ui/components";
import { theme } from "@/ui/theme";

/**
 * The till's own history, straight from the local store. Deliberately not an online-first list
 * like the movement log: a cashier looking up the receipt they just printed must not need a
 * network, and sales this device made are the ones it will be asked about.
 */
export default function SalesHistoryScreen() {
  const [sales, setSales] = React.useState<SaleRow[]>([]);
  const [locationNames, setLocationNames] = React.useState<Map<string, string>>(new Map());
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const [rows, locations] = await Promise.all([salesList(50), locationsList()]);
    setSales(rows);
    setLocationNames(new Map(locations.map((l) => [l.id, l.name])));
    setLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load])
  );

  const unsynced = sales.filter((sale) => !sale.synced).length;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Recent sales</AppText>

        {unsynced > 0 ? (
          <AppText muted>
            {unsynced === 1 ? "1 sale is" : `${unsynced} sales are`} waiting to sync. They are complete as far as the
            shop is concerned.
          </AppText>
        ) : null}

        {loading ? <AppText muted>Loading…</AppText> : null}
        {!loading && sales.length === 0 ? (
          <Card>
            <Stack gap={12}>
              <AppText>No sales on this device yet.</AppText>
              <Button title="Start a sale" onPress={() => router.push("/(tabs)/pos")} />
            </Stack>
          </Card>
        ) : null}

        {sales.map((sale) => (
          <Pressable
            key={sale.id}
            onPress={() => router.push(`/(tabs)/pos/receipt/${sale.id}`)}
            style={({ pressed }) => [
              {
                padding: 14,
                borderRadius: theme.radii.md,
                backgroundColor: pressed ? theme.colors.border : theme.colors.surface,
              },
            ]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <View style={{ flexShrink: 1 }}>
                <AppText>{new Date(sale.sold_at).toLocaleString()}</AppText>
                <AppText muted>
                  {locationNames.get(sale.location_id) ?? "Unknown location"} ·{" "}
                  {sale.items.length === 1 ? "1 line" : `${sale.items.length} lines`}
                </AppText>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <AppText variant="h3">{sale.total_amount}</AppText>
                {sale.synced ? null : <Badge tone="warning" label="Unsynced" />}
              </View>
            </View>
          </Pressable>
        ))}

        <Button title="Back to till" variant="ghost" onPress={() => router.push("/(tabs)/pos")} />
      </Stack>
    </Screen>
  );
}
