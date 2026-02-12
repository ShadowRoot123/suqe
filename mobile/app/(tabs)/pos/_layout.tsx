import { Stack } from "expo-router";
import React from "react";

export default function PosLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "POS Terminal" }} />
      <Stack.Screen name="orders" options={{ title: "Orders" }} />
    </Stack>
  );
}

