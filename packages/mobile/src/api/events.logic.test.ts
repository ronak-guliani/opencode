import { describe, expect, test } from "bun:test"
import { coalesceDeltaBatch, parseSSE, resolveSessionDiffPayload, type AppEvent, type MessagePartDeltaEvent } from "./events.logic"

function delta(delta: string, overrides?: Partial<MessagePartDeltaEvent["properties"]>): MessagePartDeltaEvent {
  return {
    type: "message.part.delta",
    properties: {
      sessionID: "session-1",
      messageID: "message-1",
      partID: "part-1",
      field: "text",
      delta,
      ...overrides,
    },
  }
}

describe("coalesceDeltaBatch", () => {
  test("merges adjacent deltas for the same part key", () => {
    const result = coalesceDeltaBatch([delta("hel"), delta("lo")], true)

    expect(result.deltaEvents).toBe(2)
    expect(result.merged).toBe(1)
    expect(result.events).toEqual([delta("hello")])
  })

  test("does not merge non-adjacent deltas across other events", () => {
    const updated = {
      type: "message.part.updated" as const,
      properties: {
        sessionID: "session-1",
        messageID: "message-1",
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "session-1",
          type: "text",
          text: "hello",
        },
      },
    } as AppEvent

    const result = coalesceDeltaBatch([delta("hel"), updated, delta("lo")], true)

    expect(result.merged).toBe(0)
    expect(result.events).toEqual([delta("hel"), updated, delta("lo")])
  })
})

describe("resolveSessionDiffPayload", () => {
  test("supports both diff and diffs payload keys", () => {
    expect(resolveSessionDiffPayload({ diff: [{ file: "a.ts" }] })).toEqual([{ file: "a.ts" }])
    expect(resolveSessionDiffPayload({ diffs: [{ file: "b.ts" }] })).toEqual([{ file: "b.ts" }])
    expect(resolveSessionDiffPayload({})).toEqual([])
  })
})

describe("parseSSE", () => {
  test("parses complete events and preserves incomplete trailing chunks", () => {
    const buffer = [
      'data: {"type":"message.part.delta","properties":{"sessionID":"s","messageID":"m","partID":"p","field":"text","delta":"hi"}}',
      "",
      'data: {"type":"message.part.delta","properties":{"sessionID":"s","messageID":"m","partID":"p","field":"text","delta":"bye"}}',
    ].join("\n")

    const result = parseSSE(buffer)

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toEqual({
      type: "message.part.delta",
      properties: {
        sessionID: "s",
        messageID: "m",
        partID: "p",
        field: "text",
        delta: "hi",
      },
    })
    expect(result.remaining).toContain('"delta":"bye"')
  })
})
