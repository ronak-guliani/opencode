import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import { Linking, Platform, StyleSheet, Text, type TextStyle, type ViewStyle, View } from "react-native"
import MarkdownBase from "react-native-markdown-display"
import { StreamdownRN } from "streamdown-rn"
import { useTheme, type Theme } from "../../theme"
import { FEATURE_FLAGS } from "../../config/feature-flags"
import { telemetry } from "../../perf/telemetry"
import { CodeBlock } from "./code-block"

type Props = {
  children: string
  variant?: "default" | "reasoning"
  isComplete?: boolean
}

const TYPED_STREAM_MAX_CHARS = 48_000
const TYPED_STREAM_TICK_MS = 12
const TYPED_STREAM_BASE_CPS = 96
const TYPED_STREAM_MAX_CPS = 640
const TYPED_STREAM_SAFE_MAX_CHARS = 4_800
const TYPED_STREAM_SAFE_MAX_CHARS_IOS = 2_400
const TYPED_STREAM_LAG_BAILOUT_IOS = 760
const TYPED_STREAM_READABLE_LOOKAHEAD = 18
const UNSAFE_TYPED_STREAM_PATTERN = /```|^\s*\|.*\|/m

const Streamdown = StreamdownRN as React.ComponentType<{
  children: string
  theme?: unknown
  style?: object
  isComplete?: boolean
  onError?: (error: Error) => void
}>

const Markdown = MarkdownBase as React.ComponentType<{
  rules?: Record<string, unknown>
  style?: Record<string, TextStyle | ViewStyle>
  children?: React.ReactNode
}>

type BoundaryProps = {
  fallback: React.ReactNode
  onCrash?: () => void
  children: React.ReactNode
}

class MarkdownErrorBoundary extends React.Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    this.props.onCrash?.()
    telemetry.error("ui", "markdown:crash", { message: error.message })
    if (__DEV__) {
      console.warn("[markdown] stream renderer crashed, falling back", error)
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function allowTypedStreaming(input: string, variant: "default" | "reasoning", isComplete: boolean) {
  if (variant !== "default") return false
  if (isComplete) return false
  const maxChars =
    Platform.OS === "ios" && FEATURE_FLAGS.iosAggressiveTypedStreamingGate
      ? TYPED_STREAM_SAFE_MAX_CHARS_IOS
      : TYPED_STREAM_SAFE_MAX_CHARS
  if (input.length > maxChars) return false
  if (UNSAFE_TYPED_STREAM_PATTERN.test(input)) return false
  return true
}

function findReadableRevealBoundary(target: string, currentLength: number, nextLength: number) {
  if (nextLength >= target.length) return target.length
  if (nextLength <= currentLength) return currentLength

  const lookaheadLimit = Math.min(target.length, nextLength + TYPED_STREAM_READABLE_LOOKAHEAD)
  for (let cursor = nextLength; cursor < lookaheadLimit; cursor += 1) {
    const char = target[cursor]
    const prev = target[cursor - 1]
    if (char === "\n") return cursor
    if (/\s/.test(char)) return cursor
    if (/[.,!?;:)]/.test(prev)) return cursor
  }

  return nextLength
}

function useTypedStreamingText(input: string, opts: { enabled: boolean; isComplete: boolean }) {
  const { enabled, isComplete } = opts
  const [displayed, setDisplayed] = useState(input)
  const displayedRef = useRef(input)
  const targetRef = useRef(input)
  const isCompleteRef = useRef(isComplete)
  const lastTickRef = useRef(Date.now())
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = () => {
    if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const syncDisplayed = (next: string) => {
    displayedRef.current = next
    setDisplayed(next)
  }

  const scheduleRef = useRef<() => void>(() => {})
  const stepRef = useRef<() => void>(() => {})

  stepRef.current = () => {
    rafRef.current = null
    timerRef.current = null

    const now = Date.now()
    const dt = clamp(now - lastTickRef.current, 8, 50)
    lastTickRef.current = now

    const current = displayedRef.current
    const target = targetRef.current
    if (!target || target.length <= current.length) return

    const lag = target.length - current.length
    if (Platform.OS === "ios" && FEATURE_FLAGS.iosAggressiveTypedStreamingGate && lag > TYPED_STREAM_LAG_BAILOUT_IOS) {
      syncDisplayed(target)
      return
    }
    if (isCompleteRef.current || target.length > TYPED_STREAM_MAX_CHARS) {
      syncDisplayed(target)
      return
    }

    let boost = 1
    if (lag > 900) boost = 6
    else if (lag > 540) boost = 4.6
    else if (lag > 280) boost = 3.4
    else if (lag > 140) boost = 2.4
    else if (lag > 60) boost = 1.6

    const cps = clamp(TYPED_STREAM_BASE_CPS * boost, TYPED_STREAM_BASE_CPS, TYPED_STREAM_MAX_CPS)
    const charsToReveal = clamp(Math.round((cps * dt) / 1000), 1, 96)
    const rawNextLen = Math.min(target.length, current.length + charsToReveal)
    const nextLen = findReadableRevealBoundary(target, current.length, rawNextLen)

    syncDisplayed(target.slice(0, nextLen))
    if (nextLen < target.length) {
      scheduleRef.current()
    }
  }

  scheduleRef.current = () => {
    if (rafRef.current !== null || timerRef.current) return
    if (typeof requestAnimationFrame === "function") {
      rafRef.current = requestAnimationFrame(() => {
        stepRef.current()
      })
      timerRef.current = setTimeout(() => {
        if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        timerRef.current = null
        stepRef.current()
      }, TYPED_STREAM_TICK_MS)
      return
    }
    timerRef.current = setTimeout(() => {
      stepRef.current()
    }, TYPED_STREAM_TICK_MS)
  }

  useEffect(() => {
    isCompleteRef.current = isComplete
  }, [isComplete])

  useEffect(() => {
    if (!enabled) {
      stop()
      targetRef.current = input
      if (displayedRef.current !== input) syncDisplayed(input)
      return
    }

    const prevTarget = targetRef.current
    targetRef.current = input

    if (!input) {
      stop()
      syncDisplayed("")
      return
    }

    const nonAppendReset =
      prevTarget.length > 0 && !input.startsWith(prevTarget) && !input.startsWith(displayedRef.current)
    if (nonAppendReset || isComplete || input.length > TYPED_STREAM_MAX_CHARS) {
      stop()
      if (displayedRef.current !== input) syncDisplayed(input)
      return
    }

    if (!input.startsWith(displayedRef.current)) {
      syncDisplayed(input)
      return
    }

    if (displayedRef.current.length < input.length) {
      scheduleRef.current()
    }
  }, [enabled, input, isComplete])

  useEffect(() => {
    return () => stop()
  }, [])

  return displayed
}

function rules(theme: Theme) {
  return {
    fence: (node: { key: string; sourceInfo?: string; content?: string }) => {
      const lang = node.sourceInfo || ""
      const code = node.content?.replace(/\n$/, "") ?? ""
      return <CodeBlock key={node.key} code={code} language={lang} />
    },
    code_inline: (node: { key: string; content?: string }) => (
      <Text
        key={node.key}
        style={[styles.codeInline, { backgroundColor: theme.colors.codeInline, color: theme.colors.codeInlineText }]}
      >
        {node.content}
      </Text>
    ),
    link: (node: { key: string; attributes?: { href?: string } }, children: React.ReactNode) => (
      <Text
        key={node.key}
        style={[styles.linkText, { color: theme.colors.link }]}
        onPress={() => {
          if (!node.attributes?.href) return
          Linking.openURL(node.attributes.href).catch(() => {
            // ignore invalid URLs from model output
          })
        }}
      >
        {children}
      </Text>
    ),
  }
}

function stylesForVariant(theme: Theme, variant: "default" | "reasoning"): Record<string, TextStyle | ViewStyle> {
  const isReasoning = variant === "reasoning"
  const baseText: TextStyle = isReasoning ? { fontFamily: "Geist", fontStyle: "italic" } : { fontFamily: "Geist" }
  const bodySize = isReasoning ? 13 : 15
  const bodyLine = isReasoning ? 18 : 23
  const heading1Size = isReasoning ? 16 : 22
  const heading2Size = isReasoning ? 15 : 19
  const heading3Size = isReasoning ? 14 : 17
  const heading4Size = isReasoning ? 13 : 15

  return {
    body: { ...baseText, color: theme.colors.text, fontSize: bodySize, lineHeight: bodyLine },
    paragraph: { ...baseText, marginTop: 0, marginBottom: isReasoning ? 6 : 6 },
    heading1: {
      ...baseText,
      fontSize: heading1Size,
      fontWeight: "700" as const,
      marginBottom: 8,
      marginTop: 16,
      color: theme.colors.text,
    },
    heading2: {
      ...baseText,
      fontSize: heading2Size,
      fontWeight: "700" as const,
      marginBottom: 6,
      marginTop: 14,
      color: theme.colors.text,
    },
    heading3: {
      ...baseText,
      fontSize: heading3Size,
      fontWeight: "600" as const,
      marginBottom: 4,
      marginTop: 12,
      color: theme.colors.text,
    },
    heading4: {
      ...baseText,
      fontSize: heading4Size,
      fontWeight: "600" as const,
      marginBottom: 4,
      marginTop: 10,
      color: theme.colors.text,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingLeft: 12,
      marginVertical: 6,
      opacity: 0.85,
    },
    list_item: { ...baseText, marginBottom: 4 },
    bullet_list: { ...baseText, marginBottom: 8 },
    ordered_list: { ...baseText, marginBottom: 8 },
    strong: { ...baseText, fontWeight: "600" as const },
    em: { ...baseText, fontStyle: "italic" as const },
    s: { textDecorationLine: "line-through" as const },
    hr: {
      backgroundColor: theme.colors.border,
      height: StyleSheet.hairlineWidth,
      marginVertical: 12,
    },
    table: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 6,
      marginVertical: 6,
    },
    thead: { backgroundColor: theme.colors.surface },
    th: { ...baseText, padding: 8, fontWeight: "600" as const, color: theme.colors.text },
    td: { ...baseText, padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    tr: { flexDirection: "row" as const },
  }
}

const LegacyMarkdown = memo(function LegacyMarkdown({
  text,
  variant,
}: {
  text: string
  variant: "default" | "reasoning"
}) {
  const theme = useTheme()
  const mdRules = useMemo(() => rules(theme), [theme])
  const mdStyles = useMemo(() => stylesForVariant(theme, variant), [theme, variant])

  return (
    <Markdown rules={mdRules} style={mdStyles}>
      {text}
    </Markdown>
  )
})

export const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
  variant = "default",
  isComplete = true,
}: Props) {
  const theme = useTheme()
  const [useLegacyRenderer, setUseLegacyRenderer] = useState(false)
  const prevContentRef = useRef(children)

  const streamTheme = useMemo(
    () => ({
      colors: {
        background: theme.colors.background,
        foreground: theme.colors.text,
        muted: theme.colors.textSecondary,
        accent: theme.colors.accent,
        codeBackground: theme.colors.codeBackground,
        codeForeground: theme.colors.codeText,
        border: theme.colors.border,
        link: theme.colors.link,
        syntaxDefault: theme.colors.codeText,
        syntaxKeyword: theme.colors.accent,
        syntaxString: theme.colors.success,
        syntaxNumber: theme.colors.warning,
        syntaxComment: theme.colors.textTertiary,
        syntaxFunction: theme.colors.link,
        syntaxClass: theme.colors.warning,
        syntaxOperator: theme.colors.text,
      },
      fonts: {
        regular: "Geist",
        bold: "Geist",
        mono: "Geist Mono",
      },
      spacing: {
        block: variant === "reasoning" ? 6 : 8,
        inline: 4,
        indent: 12,
      },
    }),
    [theme.colors, variant],
  )

  const shouldTypeAnimate = children ? allowTypedStreaming(children, variant, isComplete) : false
  const streamingText = useTypedStreamingText(children || "", {
    enabled: shouldTypeAnimate,
    isComplete,
  })

  useEffect(() => {
    const prev = prevContentRef.current
    prevContentRef.current = children
    if (!prev) return
    if (!children.startsWith(prev) && !prev.startsWith(children)) {
      setUseLegacyRenderer(false)
    }
  }, [children])

  if (!children) return null

  const fallback = <LegacyMarkdown text={streamingText} variant={variant} />

  return (
    <View style={[styles.container, variant === "reasoning" && styles.reasoning]}>
      {useLegacyRenderer ? (
        fallback
      ) : (
        <MarkdownErrorBoundary fallback={fallback} onCrash={() => setUseLegacyRenderer(true)}>
          <Streamdown
            theme={streamTheme}
            isComplete={isComplete}
            style={styles.markdown}
            onError={(error) => {
              setUseLegacyRenderer(true)
              telemetry.error("ui", "markdown:fallback", { message: error.message })
              if (__DEV__) {
                console.warn("[markdown] stream renderer error", error)
              }
            }}
          >
            {streamingText}
          </Streamdown>
        </MarkdownErrorBoundary>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignSelf: "stretch",
  },
  markdown: {
    flex: 0,
    width: "100%",
  },
  reasoning: {
    opacity: 0.9,
  },
  codeInline: {
    fontFamily: "Geist Mono",
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  linkText: {
    textDecorationLine: "underline" as const,
  },
})
