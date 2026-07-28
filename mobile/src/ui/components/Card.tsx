import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { shadows, theme } from "@/ui/theme";

export type CardProps = ViewProps & {
  padded?: boolean;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function Card({ padded = true, title, subtitle, right, style, children, ...props }: CardProps) {
  if (title) {
    return (
      <View {...props} style={[styles.base, style]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="h3">{title}</AppText>
            {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
          </View>
          {right ? <View>{right}</View> : null}
        </View>
        <View style={padded && styles.padded}>{children}</View>
      </View>
    );
  }

  return (
    <View {...props} style={[styles.base, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    ...shadows.card,
  },
  padded: { padding: theme.spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
});
