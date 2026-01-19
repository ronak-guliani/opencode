import MarkdownNativeStub from './MarkdownNative'
import MarkdownDisplay from 'react-native-markdown-display'

const USE_NATIVE_MARKDOWN = false

export const Markdown = USE_NATIVE_MARKDOWN ? MarkdownNativeStub : MarkdownDisplay

export const MarkdownComponent = USE_NATIVE_MARKDOWN ? MarkdownNativeStub : MarkdownDisplay

export const MarkdownNative = MarkdownNativeStub
