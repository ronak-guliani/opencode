import { memo, useCallback, useMemo, useRef, type ReactNode } from "react"
import { View, Text, StyleSheet, Pressable, Alert } from "react-native"
import Feather from "@expo/vector-icons/Feather"
import type { AssistantMessage as AssistantMessageData, Message, Part } from "@opencode-ai/sdk/client"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import { useMessageParts } from "../../api/hooks"
import { useMessages } from "../../store/messages"
import { useTheme } from "../../theme"
import { PartRenderer } from "./part"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>

type Props = {
  message: AssistantMessageData
  showFooter?: boolean
  diffFooter?: ReactNode
}

export const AssistantMessage = memo(function AssistantMessage({ message, showFooter = false, diffFooter = null }: Props) {
  const theme = useTheme()
  const parts = useMessageParts(message.id)
  const hydrateMessage = useMessages((s) => s.hydrateMessage)
  const send = useMessages((s) => s.send)
  const copyCacheRef = useRef<{ key: string; text: string }>({ key: "", text: "" })
  const totalTokens = message.tokens.input + message.tokens.output + message.tokens.reasoning
  const copyKey = useMemo(() => buildCopyCacheKey(parts), [parts])
  const canRetry = !!message.time.completed
  const onHydrateMessage = useCallback(
    (messageID: string) => {
      void hydrateMessage(message.sessionID, messageID)
    },
    [hydrateMessage, message.sessionID],
  )
  const onCopy = useCallback(() => {
    let copyText = copyCacheRef.current.text
    if (copyCacheRef.current.key !== copyKey) {
      copyText = buildCopyText(parts)
      copyCacheRef.current = { key: copyKey, text: copyText }
    }
    if (!copyText.trim()) return
    void Haptics.selectionAsync()
    void Clipboard.setStringAsync(copyText)
  }, [copyKey, parts])

  const onRetry = useCallback(() => {
    if (!canRetry) return
    const state = useMessages.getState()
    const prompt = findRetryPrompt(message.id, state.messages[message.sessionID] ?? [], state.parts)
    if (!prompt) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void send(message.sessionID, prompt).catch(() => {
      Alert.alert("Retry failed", "Could not resend that prompt. Please try again.")
    })
  }, [canRetry, message.id, message.sessionID, send])

  if (parts.length === 0 && !diffFooter && !showFooter) return null

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {parts.map((part) => (
          <PartRenderer
            key={part.id}
            part={part}
            isUser={false}
            isStreamingComplete={!!message.time.completed}
            onHydrateMessage={onHydrateMessage}
          />
        ))}
      </View>
      {showFooter ? (
        <View style={styles.footer}>
          <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>
            {totalTokens > 0 ? `${formatTokens(totalTokens)} tokens` : "0 tokens"}
          </Text>
          <View style={styles.footerActions}>
            <Pressable
              style={({ pressed }) => [styles.footerIconButton, pressed && styles.footerIconButtonPressed]}
              onPress={onRetry}
              disabled={!canRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry response"
              hitSlop={8}
            >
              <FeatherIcon name="rotate-ccw" size={14} color={canRetry ? theme.colors.textTertiary : theme.colors.textTertiary + "80"} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.footerIconButton, pressed && styles.footerIconButtonPressed]}
              onPress={onCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy response"
              hitSlop={8}
            >
              <FeatherIcon name="copy" size={14} color={theme.colors.textTertiary} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {diffFooter ? <View style={styles.diffFooter}>{diffFooter}</View> : null}
    </View>
  )
})

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}

function buildCopyCacheKey(parts: Part[]) {
  return parts
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") return `${part.id}:${part.type}:${part.text.length}`
      if (part.type === "tool") {
        const output = "output" in part.state && typeof part.state.output === "string" ? part.state.output.length : 0
        const error = "error" in part.state && typeof part.state.error === "string" ? part.state.error.length : 0
        return `${part.id}:${part.type}:${part.state.status}:${output}:${error}`
      }
      return `${part.id}:${part.type}`
    })
    .join("|")
}

function findRetryPrompt(
  assistantMessageID: string,
  sessionMessages: Message[],
  partsByMessage: Record<string, Part[]>,
) {
  const assistantIndex = sessionMessages.findIndex((item) => item.id === assistantMessageID)
  if (assistantIndex <= 0) return ""

  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    const candidate = sessionMessages[i]
    if (candidate.role !== "user") continue
    const text = (partsByMessage[candidate.id] ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim()
    if (text) return text
  }

  return ""
}

function buildCopyText(parts: Part[]) {
  const blocks: string[] = []

  for (const part of parts) {
    if (part.type === "text" && part.text.trim()) {
      blocks.push(part.text.trim())
      continue
    }
    if (part.type === "reasoning" && part.text.trim()) {
      blocks.push(part.text.trim())
      continue
    }
    if (part.type === "tool") {
      const title = "title" in part.state ? part.state.title : part.tool
      const header = `[${title || part.tool}]`
      if ("output" in part.state && typeof part.state.output === "string" && part.state.output.trim()) {
        blocks.push(`${header}\n${part.state.output.trim()}`)
      } else if ("error" in part.state && typeof part.state.error === "string" && part.state.error.trim()) {
        blocks.push(`${header}\nError: ${part.state.error.trim()}`)
      } else {
        blocks.push(header)
      }
      continue
    }
    if (part.type === "file") {
      const name = part.filename || part.source?.path?.split("/").pop() || "Attached file"
      const fileText = part.source?.text?.value?.trim()
      blocks.push(fileText ? `[File] ${name}\n${fileText}` : `[File] ${name}`)
      continue
    }
    if (part.type === "patch" && part.files.length > 0) {
      blocks.push(`[Patch]\n${part.files.join("\n")}`)
      continue
    }
    if (part.type === "subtask") {
      const lines = [part.description]
      if (part.prompt?.trim()) lines.push(part.prompt.trim())
      blocks.push(lines.join("\n\n"))
      continue
    }
    if (part.type === "retry") {
      const error = part.error?.data?.message || "Unknown error"
      blocks.push(`[Retry #${part.attempt}] ${error}`)
    }
  }

  return blocks.join("\n\n").trim()
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  content: {
    width: "100%",
  },
  meta: {
    fontSize: 11,
  },
  footer: {
    width: "100%",
    marginTop: 6,
    marginLeft: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  footerIconButtonPressed: {
    opacity: 0.6,
  },
  diffFooter: {
    width: "100%",
  },
})
