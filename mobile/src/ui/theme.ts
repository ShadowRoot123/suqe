export const theme = {
  breakpoints: {
    drawerPermanentMinWidth: 900,
    sm: 0,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
  colors: {
    bg: "#ffffff",
    surface: "#ffffff",
    surfaceAlt: "#f7f7f7",
    text: "#111111",
    muted: "#666666",
    border: "#eeeeee",

    primary: "#111111",
    primaryText: "#ffffff",
    card: "#111111",
    cardMuted: "rgba(255,255,255,0.75)",
    badgeBg: "#111111",
    badgeText: "#ffffff",

    danger: "#c62828",
    dangerBg: "#ffebee",
    success: "#2e7d32",
    successBg: "#e8f5e9",
    warning: "#ef6c00",
    warningBg: "#fff3e0",

    activeBg: "#f2f2f2",
  },
  radii: {
    md: 12,
    lg: 16,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
  },
  typography: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 22,
      xxl: 28,
    },
    weight: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
  },
} as const;
