import React from "react";
import { View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Card } from "@/ui/components/Card";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";

export function KpiCard({
  label,
  value,
  subtitle,
  right,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <Card>
      <Stack gap={10}>
        <Row justify="space-between" align="flex-start">
          <AppText variant="caption">{label}</AppText>
          <View>{right}</View>
        </Row>
        <AppText variant="h1">{String(value)}</AppText>
        {subtitle ? <AppText muted>{subtitle}</AppText> : null}
      </Stack>
    </Card>
  );
}

