import { useSessionStore } from "@/store/sessions"
import { useMessageStore } from "@/store/messages"
import { useSettingsStore } from "@/store/settings"
import type { Session, Message, Part, SessionStatus } from "@opencode-ai/sdk/client"

/**
 * Thin hooks over Zustand store selectors.
 *
 * Using selectors ensures components only re-render when their specific
 * slice of state changes, not on every store update.
 */

export function useSessions(): Session[] {
  return useSessionStore((s) => s.sessions)
}

export function useSession(id: string): Session | undefined {
  return useSessionStore((s) => {
    for (const session of s.sessions) {
      if (session.id === id) return session
    }
    return undefined
  })
}

export function useCurrentSession(): Session | undefined {
  return useSessionStore((s) => {
    if (!s.current) return undefined
    for (const session of s.sessions) {
      if (session.id === s.current) return session
    }
    return undefined
  })
}

export function useSessionStatus(id: string): SessionStatus | undefined {
  return useSessionStore((s) => s.statuses[id])
}

export function useMessages(sessionId: string): Message[] {
  return useMessageStore((s) => s.messages[sessionId] ?? EMPTY_MESSAGES)
}

export function useParts(messageId: string): Part[] {
  return useMessageStore((s) => s.parts[messageId] ?? EMPTY_PARTS)
}

export function useBootstrapStatus() {
  return useSettingsStore((s) => s.status)
}

export function useProject() {
  return useSettingsStore((s) => s.project)
}

export function useProviders() {
  return useSettingsStore((s) => s.providers)
}

/** Stable empty arrays to prevent unnecessary re-renders */
const EMPTY_MESSAGES: Message[] = []
const EMPTY_PARTS: Part[] = []
