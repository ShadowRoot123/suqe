import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Card } from "@/ui/components/Card";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";
import { theme } from "@/ui/theme";

export type KpiTone = "default" | "primary" | "success" | "warning" | "danger";

const TONE = {
  default: { value: theme.colors.text, icon: theme.colors.muted, iconBg: theme.colors.surfaceAlt },
  primary: { value: theme.colors.primary, icon: theme.colors.primary, iconBg: theme.colors.primarySoft },
  success: { value: theme.colors.successText, icon: theme.colors.successText, iconBg: theme.colors.successBg },
  warning: { value: theme.colors.warningText, icon: theme.colors.warningText, iconBg: theme.colors.warningBg },
  danger: { value: theme.colors.dangerText, icon: theme.colors.dangerText, iconBg: theme.colors.dangerBg },
} as const;

export function KpiCard({
  label,
  value,
  subtitle,
  right,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  right?: React.ReactNode;
  tone?: KpiTone;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const palette = TONE[tone];

  return (
    <Card>
      <Stack gap={10}>
        <Row justify="space-between" align="flex-start">
          <AppText variant="label">{label}</AppText>
          {right ? (
            <View>{right}</View>
          ) : icon ? (
            <View style={[styles.icon, { backgroundColor: palette.iconBg }]}>
              <Ionicons name={icon} size={16} color={palette.icon} />
            </View>
          ) : null}
        </Row>
        <AppText style={[styles.value, { color: palette.value }]}>{String(value)}</AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  value: {
    fontSize: theme.typography.size.xxl,
    fontWeight: theme.typography.weight.bold,
    letterSpacing: -0.5,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: theme.radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
