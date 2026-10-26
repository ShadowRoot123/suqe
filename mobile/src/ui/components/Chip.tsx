import React from "react";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type ChipProps = Omit<PressableProps, "children"> & {
  label: string;
  selected?: boolean;
  left?: React.ReactNode;
};

export function Chip({ label, selected, left, style, ...props }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      {...props}
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        pressed && styles.pressed,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <View style={styles.inner}>
        {left}
        <AppText variant="caption" style={[styles.text, selected && styles.textSelected]}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  selected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pressed: { opacity: 0.85 },
  inner: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { color: theme.colors.text, fontWeight: theme.typography.weight.semibold },
  textSelected: { color: theme.colors.primaryText },
});

