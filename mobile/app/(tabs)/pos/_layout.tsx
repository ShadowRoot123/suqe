import { Stack } from "expo-router";
import React from "react";

export default function PosLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Sell" }} />
      <Stack.Screen name="orders" options={{ title: "Recent sales" }} />
      <Stack.Screen name="receipt/[id]" options={{ title: "Receipt" }} />
    </Stack>
  );
}

