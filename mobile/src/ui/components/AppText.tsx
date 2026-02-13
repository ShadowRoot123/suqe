import React from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { theme } from "@/ui/theme";

export type TextVariant = "h1" | "h2" | "body" | "caption";

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  muted?: boolean;
};

export function AppText({ variant = "body", muted, style, ...props }: AppTextProps) {
  return (
    <Text
      {...props}
      style={[
        styles.base,
        variant === "h1" && styles.h1,
        variant === "h2" && styles.h2,
        variant === "caption" && styles.caption,
        muted && styles.muted,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: theme.colors.text, fontSize: theme.typography.size.md },
  muted: { color: theme.colors.muted },
  h1: { fontSize: theme.typography.size.xl, fontWeight: theme.typography.weight.bold },
  h2: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold },
  caption: { fontSize: theme.typography.size.sm, color: theme.colors.muted },
});

