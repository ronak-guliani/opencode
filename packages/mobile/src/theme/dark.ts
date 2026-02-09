import { spacing, radii, typography } from "./tokens"

/**
 * Theme color palette shape. Both light and dark implement this interface.
 */
export interface ThemeColors {
  background: string
  surface: string
  surfaceRaised: string
  overlay: string

  text: string
  textSecondary: string
  textTertiary: string
  textInverse: string

  accent: string
  accentText: string

  border: string
  borderFocused: string

  idle: string
  busy: string
  error: string
  retry: string

  pressable: string
  destructive: string

  codeBackground: string
  codeBorder: string

  userBubble: string
  userBubbleText: string
}

export interface AppTheme {
  colors: ThemeColors
  spacing: typeof spacing
  radii: typeof radii
  typography: typeof typography
}

/**
 * Dark theme palette. Primary color scheme inspired by the opencode CLI/web app.
 * Uses zinc-based neutrals with blue accent.
 */
export const dark: AppTheme = {
  colors: {
    background: "#09090b",
    surface: "#18181b",
    surfaceRaised: "#27272a",
    overlay: "rgba(0, 0, 0, 0.6)",

    text: "#fafafa",
    textSecondary: "#a1a1aa",
    textTertiary: "#71717a",
    textInverse: "#09090b",

    accent: "#3b82f6",
    accentText: "#ffffff",

    border: "#27272a",
    borderFocused: "#3b82f6",

    idle: "#22c55e",
    busy: "#eab308",
    error: "#ef4444",
    retry: "#f97316",

    pressable: "rgba(255, 255, 255, 0.06)",
    destructive: "#ef4444",

    codeBackground: "#1e1e2e",
    codeBorder: "#313244",

    userBubble: "#3b82f6",
    userBubbleText: "#ffffff",
  },
  spacing,
  radii,
  typography,
}
