import React from "react";
import { Platform, useWindowDimensions } from "react-native";

import { getBreakpointName } from "@/ui/responsive";

function readWebWindow() {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * On web, react-native-web reports a window width of 0 here, which would pin
 * every layout to the mobile breakpoint. Fall back to the real window size and
 * track it across resizes; native uses useWindowDimensions unchanged.
 */
export function useBreakpoint() {
  const { width, height, fontScale, scale } = useWindowDimensions();
  const [webSize, setWebSize] = React.useState(readWebWindow);

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onResize = () => setWebSize({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveWidth = width > 0 ? width : webSize?.width ?? width;
  const effectiveHeight = height > 0 ? height : webSize?.height ?? height;
  const name = getBreakpointName(effectiveWidth);

  return {
    name,
    width: effectiveWidth,
    height: effectiveHeight,
    scale,
    fontScale,
    isMobile: name === "mobile",
    isTablet: name === "tablet",
    isDesktop: name === "desktop",
  };
}
