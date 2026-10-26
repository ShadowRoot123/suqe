import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type NoticeTone = "info" | "warning" | "danger";

const TONE = {
  info: { bg: theme.colors.infoBg, text: theme.colors.infoText, icon: "information-circle-outline" },
  warning: { bg: theme.colors.warningBg, text: theme.colors.warningText, icon: "cloud-offline-outline" },
  danger: { bg: theme.colors.dangerBg, text: theme.colors.dangerText, icon: "warning-outline" },
} as const;

/** A tinted banner: icon, optional bold title, a line of body text, and an optional action. */
export function Notice({
  tone,
  title,
  children,
  icon,
  action,
}: {
  tone: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  action?: React.ReactNode;
}) {
  const palette = TONE[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <Ionicons name={icon ?? palette.icon} size={18} color={palette.text} style={styles.icon} />
      <View style={styles.body}>
        {title ? <AppText style={[styles.title, { color: palette.text }]}>{title}</AppText> : null}
        {children ? (
          <AppText variant="caption" style={{ color: palette.text }}>
            {children}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
  },
  icon: { alignSelf: "flex-start", marginTop: 1 },
  body: { flex: 1, gap: 2 },
  title: { fontWeight: theme.typography.weight.semibold },
});
