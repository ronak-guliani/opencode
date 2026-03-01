import { Platform } from "react-native"

export type DiffRendererMode = "native" | "pierre_webview"

export const DIFF_RENDERER_MODE: DiffRendererMode = "native"

export type StreamFlushPolicy = {
  minMs: number
  maxMs: number
  budgetMs: number
  coalesceDeltaByKey: boolean
}

export const FEATURE_FLAGS = {
  iosAdaptiveStreamFlush: true,
  iosAggressiveTypedStreamingGate: true,
  iosClippedSubviews: false,
} as const

const IOS_STREAM_FLUSH_POLICY: StreamFlushPolicy = {
  minMs: 16,
  maxMs: 40,
  budgetMs: 8,
  coalesceDeltaByKey: true,
}

const DEFAULT_STREAM_FLUSH_POLICY: StreamFlushPolicy = {
  minMs: 16,
  maxMs: 28,
  budgetMs: 10,
  coalesceDeltaByKey: true,
}

export function streamFlushPolicy(): StreamFlushPolicy {
  if (Platform.OS === "ios" && FEATURE_FLAGS.iosAdaptiveStreamFlush) {
    return IOS_STREAM_FLUSH_POLICY
  }
  return DEFAULT_STREAM_FLUSH_POLICY
}
