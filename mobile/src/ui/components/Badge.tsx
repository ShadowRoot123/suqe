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
  neutral: { bg: theme.colors.surfaceAlt, border: theme.colors.border, text: theme.colors.textSecondary },
  info: { bg: theme.colors.infoBg, border: theme.colors.infoBg, text: theme.colors.infoText },
  success: { bg: theme.colors.successBg, border: theme.colors.successBg, text: theme.colors.successText },
  warning: { bg: theme.colors.warningBg, border: theme.colors.warningBg, text: theme.colors.warningText },
  danger: { bg: theme.colors.dangerBg, border: theme.colors.dangerBg, text: theme.colors.dangerText },
} as const;

export function Badge({ label, tone = "neutral", style, ...props }: BadgeProps) {
  const palette = TONE[tone];
  return (
    <View
      {...props}
      style={[styles.base, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
    >
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
  },
  text: { fontWeight: theme.typography.weight.semibold },
});
