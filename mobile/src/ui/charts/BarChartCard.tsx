import React from "react";

import { BarChart, type BarChartPoint } from "@/ui/charts/BarChart";
import { ChartCard } from "@/ui/charts/ChartCard";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

export function BarChartCard({
  title,
  subtitle,
  right,
  data,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  data: BarChartPoint[];
}) {
  const bp = useBreakpoint();
  const height = bp.isMobile ? 220 : bp.isTablet ? 260 : 300;

  return (
    <ChartCard title={title} subtitle={subtitle} right={right}>
      <BarChart data={data} height={height} />
    </ChartCard>
  );
}

