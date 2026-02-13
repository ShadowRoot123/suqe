import { theme } from "@/ui/theme";

export type BreakpointName = "mobile" | "tablet" | "desktop";

export function getBreakpointName(width: number): BreakpointName {
  if (width >= theme.breakpoints.lg) return "desktop";
  if (width >= theme.breakpoints.md) return "tablet";
  return "mobile";
}

export function clampMaxWidth(width: number, max: number) {
  return width > max ? max : width;
}

