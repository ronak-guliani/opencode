import { create as createStore } from "zustand"
import type { Permission } from "@opencode-ai/sdk/client"
import { headers, url } from "../api/client"

type PendingQuestionOption = {
  label: string
  description: string
}

type PendingQuestionInfo = {
  question: string
  header: string
  options: PendingQuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type PendingQuestion = {
  id: string
  sessionID: string
  questions: PendingQuestionInfo[]
}

type PermissionReply = "once" | "always" | "reject"
type QuestionAnswer = string[]

type RequestState = {
  permissions: Permission[]
  questions: PendingQuestion[]
  pendingCountBySession: Record<string, number>
  loading: boolean
  reset: () => void
  refresh: () => Promise<void>
  replyPermission: (requestID: string, reply: PermissionReply, message?: string) => Promise<void>
  replyQuestion: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  _upsertPermission: (permission: Permission) => void
  _removePermission: (requestID: string) => void
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders = headers()
  const response = await fetch(`${url()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...baseHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function pendingCounts(permissions: Permission[], questions: PendingQuestion[]) {
  const counts: Record<string, number> = {}
  for (const permission of permissions) {
    counts[permission.sessionID] = (counts[permission.sessionID] ?? 0) + 1
  }
  for (const question of questions) {
    counts[question.sessionID] = (counts[question.sessionID] ?? 0) + 1
  }
  return counts
}

export const useRequests = createStore<RequestState>((set, get) => ({
  permissions: [],
  questions: [],
  pendingCountBySession: {},
  loading: false,

  reset: () =>
    set({
      permissions: [],
      questions: [],
      pendingCountBySession: {},
      loading: false,
    }),

  refresh: async () => {
    set({ loading: true })
    try {
      const [permissions, questions] = await Promise.all([
        request<Permission[]>("/permission"),
        request<PendingQuestion[]>("/question"),
      ])
      set({
        permissions: Array.isArray(permissions) ? permissions : [],
        questions: Array.isArray(questions) ? questions : [],
        pendingCountBySession: pendingCounts(
          Array.isArray(permissions) ? permissions : [],
          Array.isArray(questions) ? questions : [],
        ),
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  replyPermission: async (requestID, reply, message) => {
    await request<boolean>(`/permission/${encodeURIComponent(requestID)}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reply,
        message,
      }),
    })
    get()._removePermission(requestID)
  },

  replyQuestion: async (requestID, answers) => {
    await request<boolean>(`/question/${encodeURIComponent(requestID)}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers,
      }),
    })
    set((state) => ({
      questions: state.questions.filter((item) => item.id !== requestID),
      pendingCountBySession: pendingCounts(
        state.permissions,
        state.questions.filter((item) => item.id !== requestID),
      ),
    }))
  },

  rejectQuestion: async (requestID) => {
    await request<boolean>(`/question/${encodeURIComponent(requestID)}/reject`, {
      method: "POST",
    })
    set((state) => ({
      questions: state.questions.filter((item) => item.id !== requestID),
      pendingCountBySession: pendingCounts(
        state.permissions,
        state.questions.filter((item) => item.id !== requestID),
      ),
    }))
  },

  _upsertPermission: (permission) => {
    set((state) => {
      const idx = state.permissions.findIndex((item) => item.id === permission.id)
      if (idx >= 0) {
        const next = [...state.permissions]
        next[idx] = permission
        return {
          permissions: next,
          pendingCountBySession: pendingCounts(next, state.questions),
        }
      }
      const next = [permission, ...state.permissions]
      return {
        permissions: next,
        pendingCountBySession: pendingCounts(next, state.questions),
      }
    })
  },

  _removePermission: (requestID) => {
    set((state) => ({
      permissions: state.permissions.filter((item) => item.id !== requestID),
      pendingCountBySession: pendingCounts(
        state.permissions.filter((item) => item.id !== requestID),
        state.questions,
      ),
    }))
  },
}))
