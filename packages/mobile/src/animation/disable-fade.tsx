import { createContext, useContext, type ReactNode } from "react"

/**
 * When this provider wraps content with `disabled=true`, all FadeInStaggered
 * children render instantly without animation. Used when switching back to
 * a chat that has already been viewed — prevents re-animating old content.
 */
const DisableFadeContext = createContext(false)

export function DisableFadeProvider({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return <DisableFadeContext.Provider value={disabled}>{children}</DisableFadeContext.Provider>
}

export function useFadeDisabled() {
  return useContext(DisableFadeContext)
}
