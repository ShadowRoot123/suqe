import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";
import { theme } from "@/ui/theme";

export type SelectOption<T extends string> = { value: T; label: string };

export type SelectFieldProps<T extends string> = {
  label?: string;
  value: T | null;
  options: SelectOption<T>[];
  placeholder?: string;
  onChange: (value: T) => void;
};

export function SelectField<T extends string>({ label, value, options, placeholder, onChange }: SelectFieldProps<T>) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value)?.label ?? placeholder ?? "Select…";

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText variant="caption" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Row justify="space-between" style={{ width: "100%" }}>
          <AppText muted={value === null}>{selected}</AppText>
          <AppText muted>▾</AppText>
        </Row>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Stack gap={12} style={{ padding: 14 }}>
            <AppText variant="h2">{label ?? "Select"}</AppText>
            <ScrollView style={{ maxHeight: 360 }}>
              <Stack gap={8}>
                {options.map((o) => (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <AppText style={o.value === value ? styles.optionSelected : undefined}>{o.label}</AppText>
                  </Pressable>
                ))}
              </Stack>
            </ScrollView>
          </Stack>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: theme.typography.weight.semibold, color: theme.colors.muted },
  field: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  pressed: { opacity: 0.85 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "20%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceAlt },
  optionSelected: { fontWeight: theme.typography.weight.bold },
});

