import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";
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
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "sm" && styles.sm,
        size === "md" && styles.md,
        size === "lg" && styles.lg,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
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
  sm: { paddingVertical: 10, paddingHorizontal: 12 },
  md: { paddingVertical: 12, paddingHorizontal: 14 },
  lg: { paddingVertical: 14, paddingHorizontal: 16 },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  ghost: { backgroundColor: "transparent", borderColor: theme.colors.border },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  label: { fontWeight: theme.typography.weight.semibold },
  labelDefault: { color: theme.colors.text },
  labelPrimary: { color: theme.colors.primaryText },
  labelSm: { fontSize: theme.typography.size.sm },
  labelLg: { fontSize: theme.typography.size.lg },
});
