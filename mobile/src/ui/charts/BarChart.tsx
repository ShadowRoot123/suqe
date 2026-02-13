import React from "react";
import { View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { theme } from "@/ui/theme";

export type BarChartPoint = { x: string; y: number };

export type BarChartProps = {
  data: BarChartPoint[];
  height?: number;
  color?: string;
};

export function BarChart({ data, height = 220, color = theme.colors.primary }: BarChartProps) {
  const [width, setWidth] = React.useState(0);

  const padding = 12;
  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const ysRaw = data.map((p) => p.y);
  const maxY = ysRaw.length ? Math.max(...ysRaw) : 1;
  const denom = maxY === 0 ? 1 : maxY;

  const n = Math.max(1, data.length);
  const slotW = innerW / n;
  const barW = Math.max(6, slotW * 0.65);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, width: "100%" }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={theme.colors.border} />
          <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={theme.colors.border} />
          {data.map((p, i) => {
            const barH = ((p.y ?? 0) / denom) * innerH;
            const x = padding + i * slotW + (slotW - barW) / 2;
            const y = padding + (innerH - barH);
            return (
              <Rect
                key={p.x}
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={color}
                rx={6}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

