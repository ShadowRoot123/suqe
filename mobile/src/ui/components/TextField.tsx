import React from "react";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

export type TextFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

export function TextField({ label, helperText, errorText, left, right, style, ...props }: TextFieldProps) {
  const showHelper = Boolean(errorText || helperText);
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="caption" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.inputRow, errorText && styles.inputRowError]}>
        {left}
        <TextInput
          {...props}
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, style]}
        />
        {right}
      </View>
      {showHelper ? (
        <AppText variant="caption" style={[styles.helper, errorText && styles.helperError]}>
          {errorText ?? helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontWeight: theme.typography.weight.semibold, color: theme.colors.muted },
  inputRow: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
  },
  inputRowError: { borderColor: theme.colors.danger },
  input: { flex: 1, color: theme.colors.text, fontSize: theme.typography.size.md },
  helper: { color: theme.colors.muted },
  helperError: { color: theme.colors.danger },
});

