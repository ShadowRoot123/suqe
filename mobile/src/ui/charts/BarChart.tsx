import React from "react";
import { View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";

import { useElementWidth } from "@/ui/hooks/useElementWidth";
import { theme } from "@/ui/theme";

export type BarChartPoint = { x: string; y: number };

export type BarChartProps = {
  data: BarChartPoint[];
  height?: number;
  color?: string;
};

const PAD_LEFT = 30;
const PAD_RIGHT = 14;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const BAR_RADIUS = 4;
const MIN_GAP = 2;

/** Bar anchored to the baseline with rounded top corners only. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(BAR_RADIUS, w / 2, Math.max(h, 0));
  if (h <= 0) return "";
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function BarChart({ data, height = 220, color = theme.colors.primary }: BarChartProps) {
  const { ref, width, onLayout } = useElementWidth();

  const innerW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerH = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  const ysRaw = data.map((p) => p.y);
  const maxY = ysRaw.length ? Math.max(...ysRaw, 1) : 1;

  const n = Math.max(1, data.length);
  const slotW = innerW / n;
  const barW = Math.max(6, Math.min(slotW - MIN_GAP, slotW * 0.68));
  const labelChars = Math.max(4, Math.floor(slotW / 6));

  const gridValues = [0, 0.5, 1];

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
                  {String(Math.round(g * maxY))}
                </SvgText>
              </React.Fragment>
            );
          })}

          {data.map((p, i) => {
            const value = p.y ?? 0;
            const barH = (value / maxY) * innerH;
            const x = PAD_LEFT + i * slotW + (slotW - barW) / 2;
            const y = PAD_TOP + (innerH - barH);
            const cx = x + barW / 2;

            return (
              <React.Fragment key={`${p.x}-${i}`}>
                {barH > 0 ? <Path d={barPath(x, y, barW, barH)} fill={color} /> : null}
                <SvgText x={cx} y={Math.max(y - 6, PAD_TOP - 4)} fontSize={11} fontWeight="700" fill={theme.colors.text} textAnchor="middle">
                  {String(value)}
                </SvgText>
                <SvgText x={cx} y={height - 8} fontSize={10} fill={theme.colors.muted} textAnchor="middle">
                  {truncate(p.x, labelChars)}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
