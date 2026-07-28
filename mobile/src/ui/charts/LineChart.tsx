import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { useElementWidth } from "@/ui/hooks/useElementWidth";
import { theme } from "@/ui/theme";

export type LineChartPoint = { x: string; y: number };

export type LineChartProps = {
  data: LineChartPoint[];
  height?: number;
  stroke?: string;
  /** Shade the area under the line. */
  area?: boolean;
};

function buildPath(xs: number[], ys: number[]) {
  if (xs.length === 0) return "";
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) d += ` L ${xs[i]} ${ys[i]}`;
  return d;
}

const PAD_LEFT = 30;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

export function LineChart({ data, height = 220, stroke = theme.colors.primary, area = true }: LineChartProps) {
  const { ref, width, onLayout } = useElementWidth();

  const innerW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerH = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  const ysRaw = data.map((p) => p.y);
  // Anchor the scale at zero so height reads as magnitude, not as offset.
  const minY = 0;
  const maxY = ysRaw.length ? Math.max(...ysRaw, 1) : 1;
  const denom = maxY === minY ? 1 : maxY - minY;

  const xs = data.map((_, i) =>
    data.length <= 1 ? PAD_LEFT + innerW / 2 : PAD_LEFT + (innerW * i) / (data.length - 1)
  );
  const ys = data.map((p) => PAD_TOP + innerH - ((p.y - minY) / denom) * innerH);
  const d = buildPath(xs, ys);
  const areaPath =
    d && xs.length > 0
      ? `${d} L ${xs[xs.length - 1]} ${PAD_TOP + innerH} L ${xs[0]} ${PAD_TOP + innerH} Z`
      : "";

  const gridValues = [0, 0.5, 1];
  const lastIdx = data.length - 1;

  // Thin out x labels so they never collide on narrow viewports.
  const maxLabels = Math.max(2, Math.floor(innerW / 52));
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <View ref={ref} onLayout={onLayout} style={{ height, width: "100%" }}>
      {width > 0 && data.length > 0 ? (
        <Svg width={width} height={height}>
          {gridValues.map((g) => {
            const y = PAD_TOP + innerH - g * innerH;
            return (
              <React.Fragment key={String(g)}>
                <Line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke={theme.colors.grid} strokeWidth={1} />
                <SvgText x={PAD_LEFT - 6} y={y + 3.5} fontSize={10} fill={theme.colors.muted} textAnchor="end">
                  {String(Math.round(minY + g * denom))}
                </SvgText>
              </React.Fragment>
            );
          })}

          {area && areaPath ? <Path d={areaPath} fill={stroke} opacity={0.08} /> : null}
          <Path d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

          {xs.map((x, i) => (
            <Circle
              key={String(i)}
              cx={x}
              cy={ys[i]}
              r={4}
              fill={stroke}
              stroke={theme.colors.surface}
              strokeWidth={2}
            />
          ))}

          {/* Direct label on the latest point only — never a number on every point. */}
          {lastIdx >= 0 ? (
            <SvgText
              x={Math.min(xs[lastIdx], width - PAD_RIGHT)}
              y={Math.max(ys[lastIdx] - 10, PAD_TOP + 8)}
              fontSize={11}
              fontWeight="700"
              fill={theme.colors.text}
              textAnchor="end"
            >
              {String(data[lastIdx].y)}
            </SvgText>
          ) : null}

          {data.map((p, i) =>
            i % labelStep === 0 || i === lastIdx ? (
              <SvgText
                key={`l-${p.x}-${i}`}
                x={xs[i]}
                y={height - 7}
                fontSize={10}
                fill={theme.colors.muted}
                textAnchor="middle"
              >
                {p.x}
              </SvgText>
            ) : null
          )}
        </Svg>
      ) : null}
    </View>
  );
}
