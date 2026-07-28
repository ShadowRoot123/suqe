import React from "react";

import { BarChart, type BarChartPoint } from "@/ui/charts/BarChart";
import { ChartCard } from "@/ui/charts/ChartCard";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

export function BarChartCard({
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
  data: BarChartPoint[];
  color?: string;
  emptyText?: string;
}) {
  const bp = useBreakpoint();
  const height = bp.isMobile ? 200 : bp.isTablet ? 240 : 260;
  const isEmpty = data.length === 0;

  return (
    <ChartCard title={title} subtitle={subtitle} right={right} isEmpty={isEmpty} emptyText={emptyText}>
      <BarChart data={data} height={height} color={color} />
    </ChartCard>
  );
}
