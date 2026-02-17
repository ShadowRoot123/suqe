import React from "react";
import { SafeAreaView, Text } from "react-native";

import { RequirePermissions } from "@/auth/RequirePermissions";

export default function PosOrdersScreen() {
  return (
    <RequirePermissions permissions={["pos.sell"]}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Orders</Text>
        <Text style={{ color: "#444" }}>Scaffolded</Text>
      </SafeAreaView>
    </RequirePermissions>
  );
}
