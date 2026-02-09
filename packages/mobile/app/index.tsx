import { useEffect } from "react"
import { Redirect } from "expo-router"
import { useConnectionStore } from "@/store/connection"

/**
 * Entry point: redirects to connect screen if no saved server URL,
 * otherwise straight to the main app.
 */
export default function Index() {
  const url = useConnectionStore((s) => s.url)
  const status = useConnectionStore((s) => s.status)

  // Still hydrating from secure storage
  if (url === null && status === "disconnected") {
    return <Redirect href="/connect" />
  }

  // Has a saved URL — go to main app (bootstrap happens in main layout)
  if (url) {
    return <Redirect href="/(main)/session" />
  }

  return <Redirect href="/connect" />
}
