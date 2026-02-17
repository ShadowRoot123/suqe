import React from "react";
import { SafeAreaView, Text, View } from "react-native";

import { RequirePermissions } from "@/auth/RequirePermissions";

export default function PosScreen() {
  return (
    <RequirePermissions permissions={["pos.sell"]}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>POS Terminal</Text>
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#444" }}>POS workflows are scaffolded (cart + checkout + receipts).</Text>
          <Text style={{ color: "#444" }}>Implement offline checkout once sales entities are wired to sync.</Text>
        </View>
      </SafeAreaView>
    </RequirePermissions>
  );
}
