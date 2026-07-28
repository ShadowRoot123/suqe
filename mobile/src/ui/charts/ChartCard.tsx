import React from "react";
import { View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Card } from "@/ui/components/Card";
import { theme } from "@/ui/theme";

export type ChartCardProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Rendered instead of the chart when there is nothing to plot. */
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
};

export function ChartCard({ title, subtitle, right, isEmpty, emptyText, children }: ChartCardProps) {
  return (
    <Card title={title} subtitle={subtitle} right={right}>
      {isEmpty ? (
        <View style={{ paddingVertical: theme.spacing.xl, alignItems: "center" }}>
          <AppText muted>{emptyText ?? "No data yet"}</AppText>
        </View>
      ) : (
        children
      )}
    </Card>
  );
}
