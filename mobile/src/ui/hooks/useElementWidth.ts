import React from "react";
import { Platform, type LayoutChangeEvent, type View } from "react-native";

/**
 * Measures the rendered width of a View.
 *
 * On web, react-native-web does not deliver onLayout reliably here (it reports
 * nothing for these containers), so fall back to observing the DOM node
 * directly. Native keeps using onLayout.
 */
export function useElementWidth() {
  const ref = React.useRef<View | null>(null);
  const [width, setWidth] = React.useState(0);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const w = node.getBoundingClientRect().width;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width, onLayout };
}
