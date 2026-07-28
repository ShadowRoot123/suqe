import { Stack } from "expo-router";
import React from "react";

export default function ProductsLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Products" }} />
      <Stack.Screen name="create" options={{ title: "New product" }} />
      <Stack.Screen name="[id]" options={{ title: "Edit product" }} />
    </Stack>
  );
}
