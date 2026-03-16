import { describe, expect, test } from "bun:test"
import { connectAndBootstrap } from "./connect-and-bootstrap"

describe("connectAndBootstrap", () => {
  test("returns success on connect + bootstrap", async () => {
    const result = await connectAndBootstrap(
      { url: "https://example.test" },
      {
        connect: async () => undefined,
        bootstrap: async () => ({ status: "complete" as const }),
        fetchSessions: async () => undefined,
        fetchStatuses: async () => undefined,
      },
    )

    expect(result).toEqual({ status: "success" })
  })

  test("returns connect-stage error for invalid url", async () => {
    const connect = async () => undefined
    const bootstrap = async () => ({ status: "complete" as const })
    const fetchSessions = async () => undefined
    const fetchStatuses = async () => undefined

    const result = await connectAndBootstrap(
      { url: "   " },
      {
        connect,
        bootstrap,
        fetchSessions,
        fetchStatuses,
      },
    )

    expect(result).toEqual({
      status: "error",
      stage: "connect",
      error: "Server URL is invalid",
    })
  })

  test("returns connect-stage error when connect fails", async () => {
    const connect = async () => {
      throw new Error("No route to host")
    }

    const result = await connectAndBootstrap(
      { url: "https://example.test" },
      {
        connect,
        bootstrap: async () => ({ status: "complete" as const }),
        fetchSessions: async () => undefined,
        fetchStatuses: async () => undefined,
      },
    )

    expect(result).toEqual({
      status: "error",
      stage: "connect",
      error: "No route to host",
    })
  })

  test("returns bootstrap-stage error when bootstrap response is error", async () => {
    const result = await connectAndBootstrap(
      { url: "https://example.test" },
      {
        connect: async () => undefined,
        bootstrap: async () => ({ status: "error" as const, error: "Missing providers" }),
        fetchSessions: async () => undefined,
        fetchStatuses: async () => undefined,
      },
    )

    expect(result).toEqual({
      status: "error",
      stage: "bootstrap",
      error: "Missing providers",
    })
  })

  test("succeeds when refresh fails but refresh is best-effort", async () => {
    let connectCalls = 0
    let refreshCalls = 0

    const result = await connectAndBootstrap(
      { url: "https://example.test", refreshSessions: true },
      {
        connect: async () => {
          connectCalls += 1
        },
        bootstrap: async () => ({ status: "complete" as const }),
        fetchSessions: async () => {
          refreshCalls += 1
          throw new Error("list failed")
        },
        fetchStatuses: async () => {
          refreshCalls += 1
        },
      },
    )

    expect(connectCalls).toBe(1)
    expect(refreshCalls).toBeGreaterThan(0)
    expect(result).toEqual({ status: "success" })
  })
})
