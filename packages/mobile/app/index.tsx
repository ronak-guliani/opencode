import { Redirect } from "expo-router"
import { useConnection } from "../src/store/connection"

export default function Index() {
  const status = useConnection((s) => s.status)

  if (status === "connected") {
    return <Redirect href="/(main)/session" />
  }

  return <Redirect href="/connect" />
}
