import React from "react";
import { View, type ViewProps } from "react-native";

import { theme } from "@/ui/theme";

export function Divider({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ height: 1, backgroundColor: theme.colors.border, width: "100%" }, style]} />;
}

