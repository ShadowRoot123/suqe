import React from "react";
import { View, type ViewProps } from "react-native";

export type RowProps = ViewProps & {
  gap?: number;
  align?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  justify?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
};

export function Row({ gap = 12, align = "center", justify = "flex-start", style, ...props }: RowProps) {
  return <View {...props} style={[{ flexDirection: "row", gap, alignItems: align, justifyContent: justify }, style]} />;
}

