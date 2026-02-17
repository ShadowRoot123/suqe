import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { makeIdempotencyKey } from "@/sync/idempotency";
import { outboxCount, outboxEnqueue } from "@/sync/outbox";
import { useToast } from "@/ui/toast";

export default function InventoryScreen() {
  const toast = useToast();
  const [pending, setPending] = React.useState(0);

  const refresh = React.useCallback(async () => {
    setPending(await outboxCount("pending"));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const queueAdjustment = React.useCallback(async () => {
    await outboxEnqueue({
      idempotencyKey: makeIdempotencyKey(),
      entity: "inventory_movement",
      operation: "create",
      payload: { kind: "adjustment", occurred_at: new Date().toISOString(), note: "Mobile adjustment (offline)" },
    });
    await refresh();
    toast.success("Inventory adjustment command added to outbox.", { title: "Queued" });
  }, [refresh, toast]);

  return (
    <RequirePermissions permissions={["inventory.read"]}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Inventory</Text>

        <View style={{ gap: 6 }}>
          <Text style={{ color: "#444" }}>Pending outbox: {pending}</Text>
        </View>

        <Pressable
          onPress={queueAdjustment}
          style={{ padding: 14, backgroundColor: "#111", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Queue adjustment (offline)</Text>
        </Pressable>

        <View style={{ gap: 6, marginTop: 8 }}>
          <Text style={{ color: "#444" }}>Inventory module is scaffolded for offline-first flow.</Text>
        </View>
      </SafeAreaView>
    </RequirePermissions>
  );
}
