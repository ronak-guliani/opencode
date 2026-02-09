import { StyleSheet } from "react-native-unistyles"
import { dark } from "./dark"
import { light } from "./light"

export type { AppTheme } from "./dark"

/**
 * Register themes with Unistyles. Adaptive themes follow system appearance.
 * Import this file once at app startup (root layout).
 */
StyleSheet.configure({
  themes: {
    light,
    dark,
  },
  settings: {
    adaptiveThemes: true,
  },
})
