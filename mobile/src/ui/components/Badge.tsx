import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type BadgeProps = ViewProps & {
  label: string;
  tone?: BadgeTone;
};

const TONE = {
  neutral: { bg: theme.colors.surfaceAlt, border: theme.colors.border, text: theme.colors.textSecondary, dot: theme.colors.muted },
  info: { bg: theme.colors.infoBg, border: theme.colors.infoBg, text: theme.colors.infoText, dot: theme.colors.info },
  success: { bg: theme.colors.successBg, border: theme.colors.successBg, text: theme.colors.successText, dot: theme.colors.success },
  warning: { bg: theme.colors.warningBg, border: theme.colors.warningBg, text: theme.colors.warningText, dot: theme.colors.warning },
  danger: { bg: theme.colors.dangerBg, border: theme.colors.dangerBg, text: theme.colors.dangerText, dot: theme.colors.danger },
} as const;

export function Badge({ label, tone = "neutral", style, ...props }: BadgeProps) {
  const palette = TONE[tone];
  return (
    <View
      {...props}
      style={[styles.base, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
    >
      {/* A shape mark as well as a colour, so the tone never rests on colour alone. */}
      <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      <AppText variant="caption" style={[styles.text, { color: palette.text }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontWeight: theme.typography.weight.semibold },
});
