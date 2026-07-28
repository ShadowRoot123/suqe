import { Stack } from "expo-router";
import React from "react";

export default function ProductGroupsLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Product groups" }} />
      <Stack.Screen name="create" options={{ title: "New group" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Product group" }} />
      <Stack.Screen name="[id]/edit" options={{ title: "Edit group" }} />
      <Stack.Screen name="[id]/products/[productId]/variants/index" options={{ title: "Variants" }} />
      <Stack.Screen name="[id]/products/[productId]/variants/create" options={{ title: "New variant" }} />
      <Stack.Screen name="[id]/products/[productId]/variants/[variantId]" options={{ title: "Edit variant" }} />
    </Stack>
  );
}
