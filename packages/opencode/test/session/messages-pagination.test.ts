import { beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session.messages pagination and compact mode", () => {
  beforeEach(() => {
    process.chdir(projectRoot)
  })

  test("supports cursor pagination using beforeMessageID", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const createdIDs: string[] = []

        for (let i = 0; i < 6; i++) {
          const message = await Session.updateMessage({
            id: Identifier.ascending("message"),
            role: "user",
            sessionID: session.id,
            agent: "default",
            model: {
              providerID: "openai",
              modelID: "gpt-4o-mini",
            },
            time: {
              created: Date.now(),
            },
          })
          createdIDs.push(message.id)
          await Session.updatePart({
            id: Identifier.ascending("part"),
            sessionID: session.id,
            messageID: message.id,
            type: "text",
            text: `message-${i}`,
          })
        }

        const firstPage = await Session.messages({
          sessionID: session.id,
          limit: 2,
        })
        expect(firstPage.map((item) => item.info.id)).toEqual(createdIDs.slice(-2))

        const olderPage = await Session.messages({
          sessionID: session.id,
          limit: 2,
          beforeMessageID: firstPage[0].info.id,
        })
        expect(olderPage.map((item) => item.info.id)).toEqual(createdIDs.slice(-4, -2))
      },
    })
  })

  test("returns compact tool output with truncation markers", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user = await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "user",
          sessionID: session.id,
          agent: "default",
          model: {
            providerID: "openai",
            modelID: "gpt-4o-mini",
          },
          time: {
            created: Date.now(),
          },
        })

        const assistant: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          role: "assistant",
          sessionID: session.id,
          mode: "default",
          agent: "default",
          path: {
            cwd: tmp.path,
            root: tmp.path,
          },
          cost: 0,
          tokens: {
            output: 0,
            input: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: "gpt-4o-mini",
          providerID: "openai",
          parentID: user.id,
          time: {
            created: Date.now(),
            completed: Date.now(),
          },
          finish: "end_turn",
        }
        await Session.updateMessage(assistant)

        const longOutput = "x".repeat(9_000)
        await Session.updatePart({
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistant.id,
          type: "tool",
          callID: "tool-1",
          tool: "read_file",
          state: {
            status: "completed",
            input: { path: "/tmp/demo.txt" },
            output: longOutput,
            title: "Read file",
            metadata: {},
            time: {
              start: Date.now() - 10,
              end: Date.now(),
            },
            attachments: [],
          },
        })

        const compact = await Session.messages({
          sessionID: session.id,
          limit: 1,
          compact: true,
        })

        const compactTool = compact[0].parts.find((part) => part.type === "tool")
        expect(compactTool?.type).toBe("tool")
        if (compactTool?.type === "tool" && compactTool.state.status === "completed") {
          expect(compactTool.state.outputTruncated).toBe(true)
          expect(compactTool.state.output.length).toBeLessThan(longOutput.length)
          expect(compactTool.state.output.includes("[truncated]")).toBe(true)
        }

        const full = await Session.messages({
          sessionID: session.id,
          limit: 1,
        })
        const fullTool = full[0].parts.find((part) => part.type === "tool")
        expect(fullTool?.type).toBe("tool")
        if (fullTool?.type === "tool" && fullTool.state.status === "completed") {
          expect(fullTool.state.output).toBe(longOutput)
          expect(fullTool.state.outputTruncated).toBeUndefined()
        }
      },
    })
  })
})
