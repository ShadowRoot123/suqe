import { getBreakpointName } from "@/ui/responsive";
import { theme } from "@/ui/theme";

describe("responsive helpers", () => {
  test("getBreakpointName uses theme breakpoints", () => {
    expect(getBreakpointName(theme.breakpoints.md - 1)).toBe("mobile");
    expect(getBreakpointName(theme.breakpoints.md)).toBe("tablet");
    expect(getBreakpointName(theme.breakpoints.lg - 1)).toBe("tablet");
    expect(getBreakpointName(theme.breakpoints.lg)).toBe("desktop");
  });
});

