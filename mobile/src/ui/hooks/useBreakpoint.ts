import { useWindowDimensions } from "react-native";

import { getBreakpointName } from "@/ui/responsive";

export function useBreakpoint() {
  const { width, height, fontScale, scale } = useWindowDimensions();
  const name = getBreakpointName(width);

  return {
    name,
    width,
    height,
    scale,
    fontScale,
    isMobile: name === "mobile",
    isTablet: name === "tablet",
    isDesktop: name === "desktop",
  };
}

