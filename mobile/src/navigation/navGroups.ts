import { Ionicons } from "@expo/vector-icons";

export type NavItem = {
  title: string;
  href?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  requiredPermissions?: string[];
  items?: NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

function allowed(permissions: string[] | undefined, required?: string[]) {
  if (!required || required.length === 0) return true;
  if (!permissions) return true;
  for (const key of required) {
    if (!permissions.includes(key)) return false;
  }
  return true;
}

function filterItems(items: NavItem[], permissions: string[] | undefined): NavItem[] {
  const filtered: NavItem[] = [];
  for (const item of items) {
    if (!allowed(permissions, item.requiredPermissions)) continue;
    if (item.items && item.items.length > 0) {
      const children = filterItems(item.items, permissions);
      if (children.length === 0) continue;
      filtered.push({ ...item, items: children });
    } else {
      filtered.push(item);
    }
  }
  return filtered;
}

export function getNavGroups(args?: { permissions?: string[] }) {
  const permissions = args?.permissions;
  const groups: NavGroup[] = [
    {
      title: "Main",
      items: [
        { title: "Dashboard", href: "/(tabs)/dashboard", icon: "grid-outline" },
        {
          title: "Products",
          icon: "pricetag-outline",
          items: [
            { title: "Product", href: "/(tabs)/products", requiredPermissions: ["catalog.read"] },
            { title: "Product Groups", href: "/(tabs)/product-groups", requiredPermissions: ["catalog.read"] },
            { title: "Catalog", href: "/(tabs)/catalog", requiredPermissions: ["catalog.read"] },
          ],
        },
        {
          title: "Inventory",
          icon: "cube-outline",
          items: [
            { title: "Inventory", href: "/(tabs)/inventory", requiredPermissions: ["inventory.read"] },
            { title: "Adjustments", href: "/(tabs)/inventory/adjustments", requiredPermissions: ["inventory.adjust"] },
            { title: "Locations", href: "/(tabs)/inventory/locations", requiredPermissions: ["locations.read"] },
          ],
        },
        {
          title: "Point of Sale",
          icon: "receipt-outline",
          items: [
            { title: "POS Terminal", href: "/(tabs)/pos", requiredPermissions: ["pos.sell"] },
            { title: "Orders", href: "/(tabs)/pos/orders", requiredPermissions: ["pos.sell"] },
          ],
        },
        { title: "Settings", href: "/(tabs)/settings", icon: "settings-outline" },
      ],
    },
    {
      title: "Admin",
      items: [{ title: "Sync", href: "/(tabs)/sync", icon: "sync-outline", requiredPermissions: ["org.manage"] }],
    },
  ];

  return groups
    .map((g) => ({ ...g, items: filterItems(g.items, permissions) }))
    .filter((g) => g.items.length > 0);
}
