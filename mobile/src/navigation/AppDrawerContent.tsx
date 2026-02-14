import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps, DrawerContentScrollView } from "@react-navigation/drawer";
import { router, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { useSyncBadges } from "@/features/sync";
import { navGroups } from "@/navigation/navGroups";
import { APP_NAME } from "@/shared/constants";
import { getInitials } from "@/shared/utils";
import { theme } from "@/ui/theme";

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const { session, clearSession } = useSession();
  const [busy, setBusy] = React.useState(false);
  const { pendingCount, changesCount, refresh } = useSyncBadges();
  const pathname = usePathname();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

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
    (item: (typeof navGroups)[number]["items"][number]) => {
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
                        active && styles.rowActive,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.rowLeft}>
                        {item.icon ? (
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={active ? theme.colors.text : theme.colors.muted}
                          />
                        ) : null}
                        <Text style={[styles.rowTitle, active ? styles.rowTitleActive : styles.rowTitleInactive]}>
                          {item.title}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={theme.colors.muted}
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
                        color={active ? theme.colors.text : theme.colors.muted}
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
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scrollContent: { paddingTop: 0, paddingBottom: theme.spacing.md },

  headerWrap: { padding: theme.spacing.md },
  headerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "white", fontWeight: "800" },
  headerText: { flex: 1, minWidth: 0 },
  brand: { color: "white", fontSize: 16, fontWeight: "800" },
  subtle: { color: theme.colors.cardMuted, marginTop: 2 },

  metaRow: { marginTop: theme.spacing.sm, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  metaText: { flex: 1, color: theme.colors.cardMuted },
  metaRight: { flexDirection: "row", gap: theme.spacing.xs },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  metaPillText: { color: "white", fontWeight: "700", fontSize: 12 },

  section: { paddingHorizontal: theme.spacing.xs, marginTop: 2 },
  sectionTitle: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.muted,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
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
  rowPressed: { opacity: 0.85 },
  rowActive: { backgroundColor: theme.colors.activeBg },
  rowTitle: { fontWeight: "800", flex: 1 },
  rowTitleActive: { color: theme.colors.text },
  rowTitleInactive: { color: theme.colors.muted },
  children: { paddingLeft: 42, paddingRight: theme.spacing.xs, marginTop: 6, gap: 6 },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: theme.radii.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.sm,
  },
  childRowActive: { backgroundColor: theme.colors.activeBg },
  childTitle: { fontWeight: "800", flex: 1, marginRight: theme.spacing.xs },
  badge: {
    minWidth: 24,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.badgeBg,
  },
  badgeText: { color: theme.colors.badgeText, fontWeight: "800", fontSize: 12 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 10,
  },
  logoutButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    alignItems: "center",
  },
  logoutButtonDisabled: { backgroundColor: "#dddddd" },
  logoutText: { color: "white", fontWeight: "800" },
  logoutTextDisabled: { color: theme.colors.muted },
  footerNote: { color: theme.colors.muted, textAlign: "center", fontSize: 12 },
});
