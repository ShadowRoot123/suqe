import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export type BadgeProps = ViewProps & {
  label: string;
  tone?: BadgeTone;
};

export function Badge({ label, tone = "neutral", style, ...props }: BadgeProps) {
  return (
    <View
      {...props}
      style={[
        styles.base,
        tone === "success" && styles.success,
        tone === "warning" && styles.warning,
        tone === "danger" && styles.danger,
        style,
      ]}
    >
      <AppText variant="caption" style={[styles.text, tone !== "neutral" && styles.textTone]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.colors.activeBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  text: { color: theme.colors.text, fontWeight: theme.typography.weight.bold },
  textTone: { color: theme.colors.text },
  success: { backgroundColor: theme.colors.successBg },
  warning: { backgroundColor: theme.colors.warningBg },
  danger: { backgroundColor: theme.colors.dangerBg },
});

