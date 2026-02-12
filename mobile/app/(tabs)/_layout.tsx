import { Ionicons } from "@expo/vector-icons";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { useWindowDimensions } from "react-native";

import { AppDrawerContent } from "@/navigation/AppDrawerContent";
import { theme } from "@/ui/theme";

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isLarge = width >= theme.breakpoints.drawerPermanentMinWidth;

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerTitleAlign: "center",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        drawerActiveTintColor: theme.colors.text,
        drawerInactiveTintColor: theme.colors.muted,
        drawerActiveBackgroundColor: theme.colors.activeBg,
        drawerInactiveBackgroundColor: "transparent",
        drawerStyle: { backgroundColor: theme.colors.bg, width: isLarge ? 320 : undefined },
        drawerLabelStyle: { fontWeight: "700" },
        drawerItemStyle: { borderRadius: theme.radii.md, marginHorizontal: theme.spacing.xs },
        drawerType: isLarge ? "permanent" : "front",
        swipeEnabled: !isLarge,
        overlayColor: isLarge ? "transparent" : undefined,
      }}
    >
      <Drawer.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          drawerIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="products"
        options={{
          title: "Products",
          drawerIcon: ({ color, size }) => <Ionicons name="pricetag-outline" color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="inventory"
        options={{
          title: "Inventory",
          drawerIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="pos"
        options={{
          title: "Point of Sale",
          drawerIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          title: "Settings",
          drawerIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Drawer>
  );
}
