import type { ViewStyle } from "react-native";

export const theme = {
  breakpoints: {
    drawerPermanentMinWidth: 900,
    sm: 0,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
  colors: {
    // Surfaces
    bg: "#f4f6f9",
    surface: "#ffffff",
    surfaceAlt: "#f1f4f8",

    // Ink
    text: "#0f172a",
    textSecondary: "#475569",
    muted: "#64748b",
    border: "#e3e8ef",
    borderStrong: "#cbd5e1",

    // Brand
    primary: "#2a78d6",
    primaryText: "#ffffff",
    primarySoft: "#e8f1fc",
    primaryStrong: "#1c5cab",

    // Sidebar (navy)
    sidebar: "#111c30",
    sidebarSurface: "#1b2941",
    sidebarText: "#eaf0f8",
    sidebarMuted: "#93a3bb",
    sidebarActiveBg: "rgba(255,255,255,0.10)",
    sidebarBorder: "rgba(255,255,255,0.08)",

    // Inverted card (drawer header, logout)
    card: "#1b2941",
    cardMuted: "rgba(255,255,255,0.72)",

    badgeBg: "#2a78d6",
    badgeText: "#ffffff",
    activeBg: "#e8f1fc",

    // Status — value colors for marks, *Text steps for type on light surfaces
    danger: "#d03b3b",
    dangerBg: "#fdecec",
    dangerText: "#a52121",
    success: "#0ca30c",
    successBg: "#e7f6e7",
    successText: "#006300",
    warning: "#fab219",
    warningBg: "#fff6e0",
    warningText: "#8a5a00",
    info: "#2a78d6",
    infoBg: "#e8f1fc",
    infoText: "#1c5cab",

    // Chart chrome
    grid: "#eceff4",
    axis: "#cbd5e1",
  },

  // Categorical series, fixed order — validated for CVD separation and the
  // lightness band against the white card surface. Never cycle or reorder.
  series: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948"],

  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  typography: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 22,
      xxl: 28,
      display: 34,
    },
    weight: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      heavy: "800",
    },
  },
} as const;

export const shadows: { card: ViewStyle; raised: ViewStyle } = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};
