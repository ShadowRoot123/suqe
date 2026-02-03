import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: "center" }}>
      <Tabs.Screen name="sync" options={{ title: "Sync" }} />
      <Tabs.Screen name="catalog" options={{ title: "Catalog" }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventory" }} />
      <Tabs.Screen name="pos" options={{ title: "POS" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}

