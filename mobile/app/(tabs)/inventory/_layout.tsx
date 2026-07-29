import { Stack } from "expo-router";
import React from "react";

export default function InventoryLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Inventory" }} />
      <Stack.Screen name="adjustments" options={{ title: "Adjustments" }} />
      <Stack.Screen name="locations/index" options={{ title: "Locations" }} />
      <Stack.Screen name="locations/create" options={{ title: "New location" }} />
      <Stack.Screen name="locations/[id]" options={{ title: "Edit location" }} />
    </Stack>
  );
}

