import * as React from "react"
import type { TextStyle, ViewStyle } from "react-native"

/**
 * Style configuration for markdown elements
 * Matches the structure used by react-native-markdown-display
 */
export interface MarkdownStyle {
  // Typography
  body?: TextStyle
  paragraph?: TextStyle & ViewStyle

  // Headings
  heading1?: TextStyle
  heading2?: TextStyle
  heading3?: TextStyle
  heading4?: TextStyle
  heading5?: TextStyle
  heading6?: TextStyle

  // Text formatting
  strong?: TextStyle
  em?: TextStyle
  del?: TextStyle

  // Inline elements
  link?: TextStyle
  code_inline?: TextStyle
  softbreak?: TextStyle
  hardbreak?: TextStyle

  // Block elements
  blockquote?: ViewStyle & TextStyle
  hr?: ViewStyle
  image?: ViewStyle

  // Code blocks
  fence?: ViewStyle & TextStyle
  code_block?: ViewStyle & TextStyle

  // Lists
  bullet_list?: ViewStyle
  ordered_list?: ViewStyle
  list_item?: ViewStyle & TextStyle
  bullet_list_icon?: TextStyle
  ordered_list_icon?: TextStyle

  // Tables
  table?: ViewStyle
  thead?: ViewStyle
  tbody?: ViewStyle
  th?: ViewStyle & TextStyle
  tr?: ViewStyle
  td?: ViewStyle & TextStyle
}

/**
 * Markdown node representation
 */
export interface MarkdownNode {
  type: string
  key: string
  content?: string
  sourceInfo?: string
  children?: MarkdownNode[]
}

/**
 * Custom markdown rule for rendering specific elements
 */
export interface MarkdownRule {
  type: string
  render: (node: MarkdownNode) => React.ReactNode
}

/**
 * Props for the MarkdownNative component
 * Designed to be a drop-in replacement for react-native-markdown-display
 */
export interface MarkdownProps {
  /**
   * Markdown content to render
   */
  children: string

  /**
   * Style configuration for markdown elements
   */
  style?: MarkdownStyle

  /**
   * Custom rendering rules
   * Rules are processed in order, first match wins
   */
  rules?: Record<string, MarkdownRule>

  /**
   * Whether text should be selectable (default: true)
   */
  selectable?: boolean

  /**
   * Callback for link presses
   */
  onLinkPress?: (url: string) => void

  /**
   * Merge style with default styles (default: true)
   */
  mergeStyle?: boolean
}

/**
 * Props for the native view component
 */
export interface MarkdownNativeViewProps extends Omit<MarkdownProps, "children"> {
  /**
   * Markdown content as a string
   */
  content: string
}

/**
 * Result from native parse operation
 */
export interface ParseResult {
  nodes: MarkdownNode[]
  metadata: {
    nodeCount: number
    charCount: number
    lineCount: number
  }
}

/**
 * Result from native render operation
 */
export interface RenderResult {
  text: string
  ranges: TextRange[]
}

/**
 * Text range with style information
 */
export interface TextRange {
  start: number
  end: number
  style: string
  attributes?: Record<string, any>
}
