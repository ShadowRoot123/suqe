import React from "react";
import { SafeAreaView, Text } from "react-native";

import { RequirePermissions } from "@/auth/RequirePermissions";

export default function InventoryAdjustmentsScreen() {
  return (
    <RequirePermissions permissions={["inventory.adjust"]}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Adjustments</Text>
        <Text style={{ color: "#444" }}>Scaffolded</Text>
      </SafeAreaView>
    </RequirePermissions>
  );
}
