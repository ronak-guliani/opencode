import type { AppTheme } from "./src/theme/dark"

/**
 * Augment Unistyles global types so the `theme` parameter in
 * StyleSheet.create factories is typed to our AppTheme.
 */
declare module "react-native-unistyles" {
  export interface UnistylesThemes {
    light: AppTheme
    dark: AppTheme
  }
}
