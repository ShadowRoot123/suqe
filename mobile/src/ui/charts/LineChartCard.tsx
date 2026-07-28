import React from "react";

import { ChartCard } from "@/ui/charts/ChartCard";
import { LineChart, type LineChartPoint } from "@/ui/charts/LineChart";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

export function LineChartCard({
  title,
  subtitle,
  right,
  data,
  color,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  data: LineChartPoint[];
  color?: string;
  emptyText?: string;
}) {
  const bp = useBreakpoint();
  const height = bp.isMobile ? 200 : bp.isTablet ? 240 : 260;
  const isEmpty = data.length === 0 || data.every((p) => !p.y);

  return (
    <ChartCard title={title} subtitle={subtitle} right={right} isEmpty={isEmpty} emptyText={emptyText}>
      <LineChart data={data} height={height} stroke={color} />
    </ChartCard>
  );
}
