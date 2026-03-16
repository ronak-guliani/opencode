import { describe, expect, test } from "bun:test"
import { toErrorMessage } from "./error-message"

describe("toErrorMessage", () => {
  test("uses Error messages", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom")
  })

  test("uses string values", () => {
    expect(toErrorMessage("network down")).toBe("network down")
  })

  test("reads message field from unknown object", () => {
    expect(toErrorMessage({ message: "timeout" })).toBe("timeout")
  })

  test("falls back for unknown values", () => {
    expect(toErrorMessage(null)).toBe("Request failed")
    expect(toErrorMessage(undefined, "Fallback")).toBe("Fallback")
  })
})
