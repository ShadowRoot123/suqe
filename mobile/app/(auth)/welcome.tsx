import { Link } from "expo-router";
import React from "react";
import { SafeAreaView, Text, View } from "react-native";

import { APP_NAME } from "@/shared/constants";

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>{APP_NAME}</Text>
        <Text style={{ color: "#444" }}>Offline-first inventory + sales</Text>
      </View>

      <View style={{ gap: 10, marginTop: 12 }}>
        <Link
          href="/(auth)/create-org"
          style={{ padding: 14, backgroundColor: "#111", color: "white", borderRadius: 10, textAlign: "center" }}
        >
          Create organization
        </Link>
        <Link
          href="/(auth)/login"
          style={{
            padding: 14,
            backgroundColor: "#f1f1f1",
            color: "#111",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          Login
        </Link>
      </View>
    </SafeAreaView>
  );
}
