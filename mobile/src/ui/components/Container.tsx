import React from "react";
import { View, type ViewProps } from "react-native";

import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

export type ContainerProps = ViewProps & {
  maxWidth?: number;
};

export function Container({ maxWidth = 1200, style, ...props }: ContainerProps) {
  const bp = useBreakpoint();
  const paddingHorizontal = bp.isMobile ? 16 : bp.isTablet ? 24 : 32;

  return (
    <View
      {...props}
      style={[{ width: "100%", maxWidth, alignSelf: "center", paddingHorizontal }, style]}
    />
  );
}

