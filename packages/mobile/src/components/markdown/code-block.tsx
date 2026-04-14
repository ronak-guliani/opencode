import { memo, useCallback, useMemo, useState } from "react"
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native"
import * as Clipboard from "expo-clipboard"
import { useTheme } from "../../theme"

const VISIBLE_LINE_CAP = 30

type Props = {
  code: string
  language?: string
}

export const CodeBlock = memo(function CodeBlock({ code, language }: Props) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const copy = useCallback(() => {
    void Clipboard.setStringAsync(code)
  }, [code])

  const normalized = normalizeLanguage(language)
  const lines = useMemo(() => code.split("\n"), [code])
  const capped = !expanded && lines.length > VISIBLE_LINE_CAP
  const visible = capped ? lines.slice(0, VISIBLE_LINE_CAP).join("\n") : code
  const highlighted = useMemo(() => cachedHighlight(visible, normalized), [visible, normalized])
  const hiddenCount = capped ? lines.length - VISIBLE_LINE_CAP : 0

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.codeBackground, borderRadius: theme.radii.md }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.codeBorder }]}>
        <Text style={[styles.language, { color: theme.colors.textTertiary }]}>{normalized || "text"}</Text>
        <Pressable onPress={copy} hitSlop={12}>
          <Text style={[styles.copy, { color: theme.colors.textTertiary }]}>Copy</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        directionalLockEnabled
        nestedScrollEnabled
      >
        <Text style={[styles.code, { color: theme.colors.codeText }]} selectable>
          {highlighted.map((token, index) => {
            if (token.type === "plain") return token.value
            return (
              <Text key={`${index}-${token.type}`} style={{ color: tokenColor(token.type, theme.colors) }}>
                {token.value}
              </Text>
            )
          })}
        </Text>
      </ScrollView>
      {capped ? (
        <Pressable
          onPress={() => setExpanded(true)}
          style={[styles.showMore, { borderTopColor: theme.colors.codeBorder }]}
        >
          <Text style={[styles.showMoreText, { color: theme.colors.link }]}>
            Show {hiddenCount} more line{hiddenCount === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
})

type TokenType = "plain" | "comment" | "string" | "number" | "keyword"
type Token = { type: TokenType; value: string }
const HIGHLIGHT_CACHE_MAX = 180
const HIGHLIGHT_FAST_PATH_MAX_CHARS = 4_800
const HIGHLIGHT_FAST_PATH_MAX_LINES = 220
const highlightCache = new Map<string, Token[]>()

const KEYWORDS: Record<string, Set<string>> = {
  ts: new Set([
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "class",
    "extends",
    "interface",
    "type",
    "import",
    "from",
    "export",
    "default",
    "new",
    "try",
    "catch",
    "finally",
    "await",
    "async",
    "true",
    "false",
    "null",
    "undefined",
  ]),
  js: new Set([
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "class",
    "extends",
    "import",
    "from",
    "export",
    "default",
    "new",
    "try",
    "catch",
    "finally",
    "await",
    "async",
    "true",
    "false",
    "null",
    "undefined",
  ]),
  json: new Set(["true", "false", "null"]),
  py: new Set([
    "def",
    "class",
    "return",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "import",
    "from",
    "as",
    "try",
    "except",
    "finally",
    "with",
    "pass",
    "break",
    "continue",
    "lambda",
    "True",
    "False",
    "None",
  ]),
  sh: new Set([
    "if",
    "then",
    "else",
    "fi",
    "for",
    "in",
    "do",
    "done",
    "while",
    "case",
    "esac",
    "function",
    "return",
    "export",
    "local",
  ]),
}

function normalizeLanguage(language?: string): string {
  const value = (language || "").toLowerCase()
  if (!value) return "text"
  if (value === "typescript" || value === "tsx") return "ts"
  if (value === "javascript" || value === "jsx") return "js"
  if (value === "python") return "py"
  if (value === "bash" || value === "zsh" || value === "shell") return "sh"
  if (value === "jsonc") return "json"
  return value
}

function codeHash(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cachedHighlight(code: string, language: string) {
  if (code.length > HIGHLIGHT_FAST_PATH_MAX_CHARS || countLines(code) > HIGHLIGHT_FAST_PATH_MAX_LINES) {
    return [{ type: "plain" as const, value: code }]
  }

  const key = `${language}:${codeHash(code)}:${code.length}`
  const cached = highlightCache.get(key)
  if (cached) {
    highlightCache.delete(key)
    highlightCache.set(key, cached)
    return cached
  }

  const next = highlight(code, language)
  highlightCache.set(key, next)
  while (highlightCache.size > HIGHLIGHT_CACHE_MAX) {
    const oldest = highlightCache.keys().next().value
    if (!oldest) break
    highlightCache.delete(oldest)
  }
  return next
}

function countLines(value: string) {
  let lines = 1
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

function highlight(code: string, language: string): Token[] {
  const tokens: Token[] = []
  const keywords = KEYWORDS[language]
  const pattern = /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g

  let last = 0
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) {
      tokens.push({ type: "plain", value: code.slice(last, index) })
    }
    const value = match[0]
    if (value.startsWith("//") || value.startsWith("#")) {
      tokens.push({ type: "comment", value })
    } else if (value.startsWith('"') || value.startsWith("'")) {
      tokens.push({ type: "string", value })
    } else if (/^\d+(\.\d+)?$/.test(value)) {
      tokens.push({ type: "number", value })
    } else if (keywords?.has(value)) {
      tokens.push({ type: "keyword", value })
    } else {
      tokens.push({ type: "plain", value })
    }
    last = index + value.length
  }

  if (last < code.length) {
    tokens.push({ type: "plain", value: code.slice(last) })
  }
  return tokens
}

function tokenColor(type: Exclude<TokenType, "plain">, colors: { [key: string]: string }) {
  if (type === "comment") return colors.textTertiary
  if (type === "string") return colors.success
  if (type === "number") return colors.warning
  return colors.accent
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  language: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  copy: {
    fontSize: 11,
    fontWeight: "500",
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  code: {
    fontFamily: "Geist Mono",
    fontSize: 13,
    lineHeight: 19,
  },
  showMore: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: "500",
  },
})
