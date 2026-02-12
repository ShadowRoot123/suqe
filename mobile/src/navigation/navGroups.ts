import { Ionicons } from "@expo/vector-icons";

export type NavItem = {
  title: string;
  href?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  items?: NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: [
      { title: "Dashboard", href: "/(tabs)/dashboard", icon: "grid-outline" },
      {
        title: "Products",
        icon: "pricetag-outline",
        items: [
          { title: "Product", href: "/(tabs)/products" },
          { title: "Product Groups", href: "/(tabs)/product-groups" },
        ],
      },
      {
        title: "Inventory",
        icon: "cube-outline",
        items: [
          { title: "Inventory", href: "/(tabs)/inventory" },
          { title: "Adjustments", href: "/(tabs)/inventory/adjustments" },
          { title: "Locations", href: "/(tabs)/inventory/locations" },
        ],
      },
      {
        title: "Point of Sale",
        icon: "receipt-outline",
        items: [
          { title: "POS Terminal", href: "/(tabs)/pos" },
          { title: "Orders", href: "/(tabs)/pos/orders" },
        ],
      },
      { title: "Settings", href: "/(tabs)/settings", icon: "settings-outline" },
    ],
  },
];

