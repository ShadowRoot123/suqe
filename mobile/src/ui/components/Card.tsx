import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { theme } from "@/ui/theme";

export type CardProps = ViewProps & {
  padded?: boolean;
};

export function Card({ padded = true, style, ...props }: CardProps) {
  return <View {...props} style={[styles.base, padded && styles.padded, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
  },
  padded: { padding: theme.spacing.md },
});

