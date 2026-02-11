import { useColorScheme } from "react-native"
import { dark, type Theme } from "./dark"
import { light } from "./light"
import { useSettings } from "../store/settings"

export { type Theme } from "./dark"
export { tokens } from "./tokens"

export function useTheme(): Theme {
  const system = useColorScheme()
  const appearance = useSettings((s) => s.appearance)
  const scheme = appearance === "system" ? system : appearance
  return scheme === "dark" ? dark : light
}
