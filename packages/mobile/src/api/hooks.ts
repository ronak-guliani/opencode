import { useMemo } from "react"
import { useSessions } from "../store/sessions"
import { useMessages as useMessageStore } from "../store/messages"
import { useRequests, type PendingQuestion } from "../store/requests"
import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/client"

const EMPTY_MESSAGES: Message[] = []
const EMPTY_PARTS: Part[] = []

export function useSessionList(): Session[] {
  return useSessions((s) => s.sessions)
}

export function useSession(id: string): Session | undefined {
  return useSessions((s) => s.sessions.find((session) => session.id === id))
}

export function useCurrentSessionId(): string | null {
  return useSessions((s) => s.current)
}

export function useSessionStatus(id: string): SessionStatus | undefined {
  return useSessions((s) => s.statuses[id])
}

export function useSessionMessages(sessionID: string): Message[] {
  return useMessageStore((s) => s.messages[sessionID] ?? EMPTY_MESSAGES)
}

export function useMessageParts(messageID: string): Part[] {
  return useMessageStore((s) => s.parts[messageID] ?? EMPTY_PARTS)
}

export function useIsSending(sessionID: string): boolean {
  return useMessageStore((s) => s.sending[sessionID] ?? false)
}

export function useSessionPermissions(sessionID: string) {
  const permissions = useRequests((s) => s.permissions)
  return useMemo(() => permissions.filter((item) => item.sessionID === sessionID), [permissions, sessionID])
}

export function useSessionQuestions(sessionID: string): PendingQuestion[] {
  const questions = useRequests((s) => s.questions)
  return useMemo(() => questions.filter((item) => item.sessionID === sessionID), [questions, sessionID])
}
