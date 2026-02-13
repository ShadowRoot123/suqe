import React from "react";
import { View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Card } from "@/ui/components/Card";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";

export type ChartCardProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function ChartCard({ title, subtitle, right, children }: ChartCardProps) {
  return (
    <Card>
      <Stack gap={10}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <AppText variant="h2">{title}</AppText>
            {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
          </View>
          <View>{right}</View>
        </Row>
        {children}
      </Stack>
    </Card>
  );
}

