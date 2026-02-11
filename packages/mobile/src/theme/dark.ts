import { tokens } from "./tokens"

const colors = {
  background: "#09090b",
  surface: "#18181b",
  surfaceRaised: "#27272a",
  border: "#27272a",
  borderSubtle: "#1e1e22",
  text: "#fafafa",
  textSecondary: "#a1a1aa",
  textTertiary: "#71717a",
  accent: "#3b82f6",
  accentText: "#ffffff",
  error: "#ef4444",
  success: "#22c55e",
  warning: "#eab308",
  userBubble: "#3b82f6",
  userBubbleText: "#ffffff",
  assistantBubble: "#18181b",
  assistantBubbleText: "#fafafa",
  composerBackground: "#18181b",
  composerBorder: "#27272a",
  statusIdle: "#22c55e",
  statusBusy: "#eab308",
  statusError: "#ef4444",
  codeBackground: "#0f0f12",
  codeBorder: "#27272a",
  codeText: "#e4e4e7",
  codeInline: "#1e1e22",
  codeInlineText: "#e4e4e7",
  link: "#60a5fa",
}

export const dark = {
  ...tokens,
  colors,
}

export type Theme = { colors: typeof colors } & typeof tokens
