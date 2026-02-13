import React from "react";

import { ChartCard } from "@/ui/charts/ChartCard";
import { LineChart, type LineChartPoint } from "@/ui/charts/LineChart";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

export function LineChartCard({
  title,
  subtitle,
  right,
  data,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  data: LineChartPoint[];
}) {
  const bp = useBreakpoint();
  const height = bp.isMobile ? 220 : bp.isTablet ? 260 : 300;

  return (
    <ChartCard title={title} subtitle={subtitle} right={right}>
      <LineChart data={data} height={height} />
    </ChartCard>
  );
}

