import { Stack } from "expo-router";

import { AppProviders } from "@/providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="scanner" options={{ presentation: "modal", title: "Scan" }} />
      </Stack>
    </AppProviders>
  );
}
