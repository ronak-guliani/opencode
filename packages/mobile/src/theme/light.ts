import { spacing, radii, typography } from "./tokens"
import type { AppTheme } from "./dark"

/**
 * Light theme palette. Same structure as dark, inverted luminance.
 */
export const light: AppTheme = {
  colors: {
    background: "#ffffff",
    surface: "#f4f4f5",
    surfaceRaised: "#e4e4e7",
    overlay: "rgba(0, 0, 0, 0.3)",

    text: "#09090b",
    textSecondary: "#52525b",
    textTertiary: "#a1a1aa",
    textInverse: "#fafafa",

    accent: "#2563eb",
    accentText: "#ffffff",

    border: "#e4e4e7",
    borderFocused: "#2563eb",

    idle: "#16a34a",
    busy: "#ca8a04",
    error: "#dc2626",
    retry: "#ea580c",

    pressable: "rgba(0, 0, 0, 0.04)",
    destructive: "#dc2626",

    codeBackground: "#f8f8f8",
    codeBorder: "#e4e4e7",

    userBubble: "#2563eb",
    userBubbleText: "#ffffff",
  },
  spacing,
  radii,
  typography,
}
