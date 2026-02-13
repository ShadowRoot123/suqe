import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { Button } from "@/ui/components/Button";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";
import { TextField } from "@/ui/components/TextField";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { theme } from "@/ui/theme";

export type FilterBarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  children?: React.ReactNode;
  onReset?: () => void;
};

export function FilterBar({ searchValue, onSearchChange, children, onReset }: FilterBarProps) {
  const bp = useBreakpoint();
  const [open, setOpen] = React.useState(false);

  if (bp.isMobile) {
    return (
      <Stack gap={10}>
        <TextField placeholder="Search…" value={searchValue} onChangeText={onSearchChange} autoCapitalize="none" />
        <Row justify="space-between">
          <Button title="Filters" variant="secondary" onPress={() => setOpen(true)} />
          {onReset ? <Button title="Reset" variant="ghost" onPress={onReset} /> : null}
        </Row>
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Stack gap={12} style={{ padding: 14 }}>
              {children}
              <Button title="Done" onPress={() => setOpen(false)} />
            </Stack>
          </View>
        </Modal>
      </Stack>
    );
  }

  return (
    <Row gap={12} align="flex-start" style={styles.desktopRow}>
      <View style={{ flex: 1, minWidth: 240 }}>
        <TextField placeholder="Search…" value={searchValue} onChangeText={onSearchChange} autoCapitalize="none" />
      </View>
      <View style={{ flex: 3 }}>{children}</View>
      {onReset ? (
        <View style={{ minWidth: 110 }}>
          <Button title="Reset" variant="ghost" onPress={onReset} />
        </View>
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  desktopRow: { width: "100%" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "15%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});

