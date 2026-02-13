import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { theme } from "@/ui/theme";

export type LineChartPoint = { x: string; y: number };

export type LineChartProps = {
  data: LineChartPoint[];
  height?: number;
  stroke?: string;
};

function buildPath(xs: number[], ys: number[]) {
  if (xs.length === 0) return "";
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) d += ` L ${xs[i]} ${ys[i]}`;
  return d;
}

export function LineChart({ data, height = 220, stroke = theme.colors.primary }: LineChartProps) {
  const [width, setWidth] = React.useState(0);

  const padding = 12;
  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const ysRaw = data.map((p) => p.y);
  const minY = ysRaw.length ? Math.min(...ysRaw) : 0;
  const maxY = ysRaw.length ? Math.max(...ysRaw) : 1;
  const denom = maxY === minY ? 1 : maxY - minY;

  const xs = data.map((_, i) => (data.length <= 1 ? padding + innerW / 2 : padding + (innerW * i) / (data.length - 1)));
  const ys = data.map((p) => padding + innerH - ((p.y - minY) / denom) * innerH);
  const d = buildPath(xs, ys);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, width: "100%" }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={theme.colors.border} />
          <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={theme.colors.border} />
          <Path d={d} stroke={stroke} strokeWidth={2.5} fill="none" />
          {xs.map((x, i) => (
            <Circle key={String(i)} cx={x} cy={ys[i]} r={3.5} fill={theme.colors.surface} stroke={stroke} strokeWidth={2} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

