import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  left,
  right,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={isDisabled}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === "sm" && styles.sm,
        size === "md" && styles.md,
        size === "lg" && styles.lg,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        variant === "link" && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color={variant === "primary" ? theme.colors.primaryText : theme.colors.text} />
        ) : (
          left
        )}
        <AppText
          variant="body"
          style={[
            styles.label,
            variant === "primary" ? styles.labelPrimary : styles.labelDefault,
            variant === "danger" && styles.labelDanger,
            variant === "link" && styles.labelLink,
            size === "sm" && styles.labelSm,
            size === "lg" && styles.labelLg,
          ]}
        >
          {title}
        </AppText>
        {right}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  sm: { paddingVertical: 9, paddingHorizontal: 12 },
  md: { paddingVertical: 11, paddingHorizontal: 16 },
  lg: { paddingVertical: 14, paddingHorizontal: 20 },
  primary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong },
  ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  danger: { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontWeight: theme.typography.weight.semibold },
  labelDefault: { color: theme.colors.textSecondary },
  labelPrimary: { color: theme.colors.primaryText },
  labelDanger: { color: theme.colors.dangerText },
  labelLink: { color: theme.colors.primaryStrong },
  labelSm: { fontSize: theme.typography.size.sm },
  labelLg: { fontSize: theme.typography.size.lg },
});
