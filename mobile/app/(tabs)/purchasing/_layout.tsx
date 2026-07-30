import { Stack } from "expo-router";
import React from "react";

export default function PurchasingLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Purchase orders" }} />
      <Stack.Screen name="create" options={{ title: "New purchase order" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Purchase order" }} />
      <Stack.Screen name="[id]/edit" options={{ title: "Edit draft order" }} />
      <Stack.Screen name="suppliers/index" options={{ title: "Suppliers" }} />
      <Stack.Screen name="suppliers/create" options={{ title: "New supplier" }} />
      <Stack.Screen name="suppliers/[id]" options={{ title: "Edit supplier" }} />
    </Stack>
  );
}
