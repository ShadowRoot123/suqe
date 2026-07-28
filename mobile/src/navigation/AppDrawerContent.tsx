import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps, DrawerContentScrollView } from "@react-navigation/drawer";
import { router, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { useSyncBadges } from "@/features/sync";
import { getNavGroups, type NavItem } from "@/navigation/navGroups";
import { APP_NAME } from "@/shared/constants";
import { getInitials } from "@/shared/utils";
import { theme } from "@/ui/theme";

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const { session, clearSession } = useSession();
  const [busy, setBusy] = React.useState(false);
  const { pendingCount, changesCount, refresh } = useSyncBadges();
  const pathname = usePathname();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const navGroups = React.useMemo(() => getNavGroups({ permissions: session?.permissions }), [session?.permissions]);

  React.useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const logout = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const api = apiForSession(session);
      await api.logout();
    } catch {
    } finally {
      await clearSession();
      setBusy(false);
    }
  }, [session, busy, clearSession]);

  const initials = getInitials(session?.email ?? session?.orgId ?? APP_NAME);

  const isHrefActive = React.useCallback(
    (href: string) => {
      if (pathname === href) return true;
      const normalized = href.endsWith("/") ? href.slice(0, -1) : href;
      return pathname === normalized || pathname.startsWith(normalized + "/");
    },
    [pathname]
  );

  const isItemActive = React.useCallback(
    (item: NavItem) => {
      if (item.href && isHrefActive(item.href)) return true;
      if (item.items && item.items.some((child) => child.href && isHrefActive(child.href))) return true;
      return false;
    },
    [isHrefActive]
  );

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const goTo = React.useCallback(
    (href: string) => {
      router.push(href);
      props.navigation.closeDrawer();
    },
    [props.navigation]
  );

  return (
    <View style={styles.root}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerWrap}>
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.brand}>{APP_NAME}</Text>
                <Text style={styles.subtle} numberOfLines={1}>
                  {session?.email ?? "Offline mode"}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaText} numberOfLines={1}>
                Org: {session?.orgId ?? "-"}
              </Text>
              <View style={styles.metaRight}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>Pending {pendingCount}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>Changes {changesCount}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {navGroups.map((group) => (
          <View key={group.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            {group.items.map((item) => {
              const active = isItemActive(item);
              const hasChildren = Array.isArray(item.items) && item.items.length > 0;
              const key = item.title;
              const isOpen = expanded[key] ?? active;

              if (hasChildren) {
                return (
                  <View key={key} style={styles.groupBlock}>
                    <Pressable
                      onPress={() => toggle(key)}
                      style={({ pressed }) => [
                        styles.row,
                        active && styles.rowGroupActive,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.rowLeft}>
                        {item.icon ? (
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={active ? theme.colors.sidebarText : theme.colors.sidebarMuted}
                          />
                        ) : null}
                        <Text style={[styles.rowTitle, active ? styles.rowTitleGroupActive : styles.rowTitleInactive]}>
                          {item.title}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={theme.colors.sidebarMuted}
                      />
                    </Pressable>

                    {isOpen ? (
                      <View style={styles.children}>
                        {item.items!.map((child) => {
                          if (!child.href) return null;
                          const childActive = isHrefActive(child.href);
                          const badge =
                            child.href === "/(tabs)/dashboard" ? pendingCount : child.href === "/(tabs)/inventory" ? pendingCount : 0;

                          return (
                            <Pressable
                              key={child.href}
                              onPress={() => goTo(child.href!)}
                              style={({ pressed }) => [
                                styles.childRow,
                                childActive && styles.childRowActive,
                                pressed && styles.rowPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.childTitle,
                                  childActive ? styles.rowTitleActive : styles.rowTitleInactive,
                                ]}
                                numberOfLines={1}
                              >
                                {child.title}
                              </Text>
                              {badge > 0 ? (
                                <View style={styles.badge}>
                                  <Text style={styles.badgeText}>{badge > 99 ? "99+" : String(badge)}</Text>
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              }

              if (!item.href) return null;

              const badge = item.href === "/(tabs)/dashboard" ? pendingCount : 0;

              return (
                <Pressable
                  key={item.href}
                  onPress={() => goTo(item.href!)}
                  style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowLeft}>
                    {item.icon ? (
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={active ? theme.colors.sidebarText : theme.colors.sidebarMuted}
                      />
                    ) : null}
                    <Text style={[styles.rowTitle, active ? styles.rowTitleActive : styles.rowTitleInactive]}>
                      {item.title}
                    </Text>
                  </View>
                  {badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge > 99 ? "99+" : String(badge)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={logout}
          disabled={!session || busy}
          style={[styles.logoutButton, (!session || busy) && styles.logoutButtonDisabled]}
        >
          <Text style={[styles.logoutText, (!session || busy) && styles.logoutTextDisabled]}>
            {busy ? "Signing out…" : "Logout"}
          </Text>
        </Pressable>

        <Text style={styles.footerNote}>Offline-first</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.sidebar },
  scrollContent: { paddingTop: 0, paddingBottom: theme.spacing.md },

  headerWrap: { padding: theme.spacing.sm },
  headerCard: {
    backgroundColor: theme.colors.sidebarSurface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.sidebarBorder,
    padding: theme.spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.colors.primaryText, fontWeight: "800" },
  headerText: { flex: 1, minWidth: 0 },
  brand: { color: theme.colors.sidebarText, fontSize: 16, fontWeight: "800" },
  subtle: { color: theme.colors.sidebarMuted, marginTop: 2, fontSize: 13 },

  metaRow: { marginTop: theme.spacing.sm, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  metaText: { flex: 1, color: theme.colors.sidebarMuted, fontSize: 11 },
  metaRight: { flexDirection: "row", gap: 6 },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  metaPillText: { color: theme.colors.sidebarText, fontWeight: "700", fontSize: 11 },

  section: { paddingHorizontal: theme.spacing.xs, marginTop: 2 },
  sectionTitle: {
    marginTop: theme.spacing.sm,
    marginBottom: 6,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.sidebarMuted,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  groupBlock: { marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: theme.radii.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.sm,
    marginHorizontal: theme.spacing.xs,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flex: 1, minWidth: 0 },
  rowPressed: { opacity: 0.7 },
  rowActive: { backgroundColor: theme.colors.primary },
  rowGroupActive: { backgroundColor: theme.colors.sidebarActiveBg },
  rowTitle: { fontWeight: "700", flex: 1, fontSize: 14 },
  rowTitleActive: { color: theme.colors.primaryText },
  rowTitleGroupActive: { color: theme.colors.sidebarText },
  rowTitleInactive: { color: theme.colors.sidebarMuted },
  children: { paddingLeft: 42, paddingRight: theme.spacing.xs, marginTop: 4, gap: 2 },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: theme.radii.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.sm,
  },
  childRowActive: { backgroundColor: theme.colors.primary },
  childTitle: { fontWeight: "600", flex: 1, marginRight: theme.spacing.xs, fontSize: 14 },
  badge: {
    minWidth: 22,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  badgeText: { color: theme.colors.sidebarText, fontWeight: "800", fontSize: 11 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.sidebarBorder,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  logoutButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.sidebarBorder,
    alignItems: "center",
  },
  logoutButtonDisabled: { opacity: 0.5 },
  logoutText: { color: theme.colors.sidebarText, fontWeight: "700" },
  logoutTextDisabled: { color: theme.colors.sidebarMuted },
  footerNote: { color: theme.colors.sidebarMuted, textAlign: "center", fontSize: 11 },
});
