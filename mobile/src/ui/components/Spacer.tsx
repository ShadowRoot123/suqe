import React from "react";
import { View } from "react-native";

export type SpacerProps = {
  size?: number;
  flex?: number;
  horizontal?: boolean;
};

export function Spacer({ size, flex, horizontal }: SpacerProps) {
  if (typeof flex === "number") return <View style={{ flex }} />;
  const v = typeof size === "number" ? size : 12;
  return <View style={horizontal ? { width: v } : { height: v }} />;
}

