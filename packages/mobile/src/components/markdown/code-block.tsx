import { memo, useCallback, useMemo } from "react"
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native"
import * as Clipboard from "expo-clipboard"
import { useTheme } from "../../theme"

type Props = {
  code: string
  language?: string
}

export const CodeBlock = memo(function CodeBlock({ code, language }: Props) {
  const theme = useTheme()

  const copy = useCallback(() => {
    void Clipboard.setStringAsync(code)
  }, [code])

  const normalized = normalizeLanguage(language)
  const highlighted = useMemo(() => highlight(code, normalized), [code, normalized])

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
    </View>
  )
})

type TokenType = "plain" | "comment" | "string" | "number" | "keyword"
type Token = { type: TokenType; value: string }

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
})
