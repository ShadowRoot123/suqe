import React from "react";
import { View, type ViewProps } from "react-native";

export type StackProps = ViewProps & {
  gap?: number;
};

export function Stack({ gap = 12, style, ...props }: StackProps) {
  return <View {...props} style={[{ gap }, style]} />;
}

