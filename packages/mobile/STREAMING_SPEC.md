# Smooth Streaming Spec

Build-ready proposal for smoother assistant response streaming in the mobile app.

Updated: 2026-03-24

---

## 1. Goal

Make assistant responses feel continuous and calm while streaming, without changing the transport layer or final canonical message state.

### Goals

- Reduce visible jank during active assistant responses.
- Reduce render churn caused by streaming deltas.
- Preserve correctness of final completed content.
- Keep existing tool, file, diff, hydration, and retry behavior intact.
- Keep the current SSE transport and batching model.

### Non-goals

- No server API or SSE protocol changes.
- No redesign of `@opencode-ai/sdk/client` message schemas.
- No persistence of ephemeral in-flight stream state.
- No redesign of tool/file/patch/diff rendering beyond what is necessary for smooth text streaming.

---

## 2. Current Problems

The app is already fast, but the streamed output still feels uneven. The issue appears to be rendering cadence and ownership, not network throughput.

### Current implementation

- SSE events are batched and coalesced in `src/api/events.ts`.
- Canonical message and part state lives in `src/store/messages.ts`.
- Chat history renders through `FlashList` in `src/components/chat/list.tsx`.
- Assistant rows render parts in `src/components/chat/assistant-message.tsx` and `src/components/chat/part.tsx`.
- Markdown rendering lives in `src/components/markdown/renderer.tsx`.

### Main issues

1. `message.part.delta` still drives frequent canonical state updates.
2. Active assistant text goes through the full markdown path while it is still changing.
3. `MarkdownRenderer` adds its own typed reveal via `useTypedStreamingText`, creating double smoothing on top of already-batched SSE.
4. Assistant rows recompute grouped parts as active part arrays change.
5. Chat bottom-follow is shared between `maintainVisibleContentPosition` and manual `scrollToEnd`, which creates competing scroll ownership.
6. Complex markdown is expensive to keep reparsing during active streaming.

### Symptoms

- Text appears in uneven bursts instead of a stable cadence.
- Scroll position can feel slightly jumpy near the bottom.
- Complex markdown can lag, then catch up abruptly.
- The UI pays full markdown costs before content is stable enough to benefit from it.

---

## 3. Proposed Architecture

Keep the current transport batching and canonical store, but introduce a dedicated ephemeral live-stream layer for in-flight assistant text.

### Core idea

Split streamed assistant text into two versions:

- `rawText`: authoritative in-flight text as it arrives from SSE.
- `visibleText`: UI snapshot shown to the user at a controlled cadence.

### Ownership model

- `src/api/events.ts`: transport batching, parsing, and event routing.
- `src/store/live-stream.ts`: ephemeral in-flight text and cadence-based UI flushes.
- `src/store/messages.ts`: canonical final state, hydration, caching, persistence, and resync.
- `src/components/chat/list.tsx`: only owner of bottom-follow behavior.
- `src/components/markdown/renderer.tsx`: final markdown renderer, not a stream scheduler.

### Rendering model

- Active assistant `text` and `reasoning` render as lightweight plain text.
- Completed assistant `text` and `reasoning` render through full markdown.
- Tool/file/patch/diff rendering stays unchanged in phase 1.

### Why this should feel smoother

- The UI stops reparsing markdown for every small delta.
- Only the active assistant text updates frequently.
- The app avoids double buffering from both SSE batching and renderer-level typing.
- Hidden messages stop paying per-frame work.

---

## 4. State Model and Data Flow

### New store

Add `src/store/live-stream.ts`.

Suggested types:

```ts
type LivePartKind = "text" | "reasoning"
type LivePartKey = `${string}:${string}`

type LivePartState = {
  sessionID: string
  messageID: string
  partID: string
  kind: LivePartKind
  baseText: string
  rawText: string
  visibleText: string
  isActive: boolean
  isVisible: boolean
  updatedAt: number
  lastFlushAt: number
}

type LiveCommit = {
  messageID: string
  partID: string
  field: "text"
  value: string
}

type LiveStreamState = {
  byPart: Record<LivePartKey, LivePartState>
  bySession: Record<string, LivePartKey[]>
  visibleMessageIDs: Record<string, string[]>

  seedPart: (part: Part) => void
  appendDelta: (event: { sessionID: string; messageID: string; partID: string; field: string; delta: string }) => void
  setVisibleMessages: (sessionID: string, messageIDs: string[]) => void
  flushVisible: (sessionID: string) => void
  commitMessage: (sessionID: string, messageID: string) => LiveCommit[]
  commitSession: (sessionID: string) => LiveCommit[]
  clearMessage: (sessionID: string, messageID: string) => void
  clearSession: (sessionID: string) => void
}
```

### Routing rules

Use the existing event stream, but split routing based on event type and field.

#### Keep canonical routing for

- `message.updated`
- `message.removed`
- `message.part.updated`
- `message.part.removed`
- non-text deltas

#### Route to live stream store for

- `message.part.delta` where:
  - `field === "text"`
  - part type is `text` or `reasoning`
  - new feature flag is enabled

### Lifecycle

1. SSE chunk arrives.
2. `src/api/events.ts` continues batching/coalescing.
3. `message.part.updated` seeds live state for eligible parts.
4. `message.part.delta` appends into `rawText` only.
5. A cadence-based flush copies `rawText` into `visibleText` for visible messages.
6. UI renders active text from `visibleText`.
7. On completion or idle, live text commits into `src/store/messages.ts` and live state clears.

### Canonical commit API

Add to `src/store/messages.ts`:

```ts
type StreamCommit = {
  messageID: string
  partID: string
  field: "text"
  value: string
}

_commitStreamParts: (sessionID: string, commits: StreamCommit[]) => void
```

### Merged selector API

Add to `src/api/hooks.ts`:

```ts
type LiveOverlay = {
  mode: "canonical" | "streaming"
  text: string
  isActive: boolean
}

type RenderablePart = {
  part: Part
  live: LiveOverlay | null
}

export function useRenderableMessageParts(messageID: string): RenderablePart[]
```

This hook should merge canonical parts with any live overlays for rendering.

---

## 5. File-by-File Implementation Plan

### `src/api/events.ts`

- Keep SSE queueing, adaptive flush, stall watchdog, and event coalescing.
- Keep batching behavior unchanged.
- Split canonical events from live text events.

Implementation changes:

- On `message.part.updated`:
  - keep existing `messages._applyEvents([event])`
  - if part type is `text` or `reasoning`, also call `liveStream.seedPart(part)`
- On eligible `message.part.delta`:
  - call `liveStream.appendDelta(event.properties)`
  - do not forward that delta into `messages._applyEvents`
- On ineligible deltas:
  - keep current canonical path
- On `message.updated` with `info.time.completed`:
  - call `liveStream.commitMessage(sessionID, messageID)`
  - pass returned commits into `messages._commitStreamParts(sessionID, commits)`
  - clear live state for that message
- On `session.idle`:
  - commit live session state first
  - then keep existing forced diff/message refresh behavior
- On `message.removed` and `message.part.removed`:
  - clear matching live entries

### `src/store/messages.ts`

- Keep this store canonical.
- Do not use it for cadence-based live reveal.

Implementation changes:

- Add `_commitStreamParts(sessionID, commits)`
- Update only targeted text/reasoning parts
- Increment `partsVersionBySession`
- Update `loadedAt`
- Schedule persistence once per commit batch
- Keep current delta buffering logic for non-text fields and late deltas

Conflict resolution rules:

1. If canonical text equals committed text, clear live only.
2. If committed text starts with canonical text, write committed text.
3. If canonical text starts with committed text, keep canonical text.
4. Otherwise prefer the longer value, log telemetry, and clear live state.

### `src/store/live-stream.ts` (new)

- Create a dedicated Zustand store with no persistence.
- Track `rawText` and `visibleText` separately.
- Use one session-level flush scheduler, not one timer per part.

Required behavior:

- `seedPart(part)` initializes or refreshes a live entry.
- `appendDelta(event)` appends only to `rawText`.
- `setVisibleMessages(sessionID, messageIDs)` marks which streamed messages should flush.
- `flushVisible(sessionID)` copies `rawText` to `visibleText` for visible active messages.
- `commitMessage` and `commitSession` return canonical commit payloads.
- `clearMessage` and `clearSession` remove ephemeral state.

### `src/api/hooks.ts`

- Add `useRenderableMessageParts(messageID)`.
- Merge canonical parts with live overlays.
- Keep existing simple selectors intact.
- Prefer a single merged hook over many small hot-path subscriptions.

### `src/components/chat/assistant-message.tsx`

- Replace `useMessageParts(message.id)` with `useRenderableMessageParts(message.id)`.
- Compute grouping from canonical part structure.
- Pass `liveText` and `renderMode` into `PartRenderer`.
- Keep retry, copy, footer, and token display unchanged.

### `src/components/chat/part.tsx`

Extend props:

```ts
type Props = {
  part: Part
  isUser: boolean
  isActive?: boolean
  isStreamingComplete?: boolean
  liveText?: string | null
  renderMode?: "canonical" | "streaming"
  onHydrateMessage?: (messageID: string) => void
}
```

Implementation changes:

- Assistant `text` and `reasoning`:
  - if `renderMode === "streaming"`, render a lightweight text component
  - otherwise render `MarkdownRenderer`
- Keep tool, file, patch, snapshot, retry, and other part types unchanged in phase 1

### `src/components/markdown/renderer.tsx`

- Remove `useTypedStreamingText`.
- Keep `StreamdownRN` and legacy fallback for completed markdown.
- Add a lightweight active renderer:

```ts
export const StreamingTextRenderer = memo(function StreamingTextRenderer({
  text,
  variant = "default",
}: {
  text: string
  variant?: "default" | "reasoning"
}) {
  // plain Text, preserve line breaks, no markdown parse
})
```

Phase 1 renderer policy:

- active content: plain text only
- completed content: full markdown

### `src/components/chat/list.tsx`

- Add `onViewableItemsChanged`.
- Publish visible message IDs into the live stream store.
- Make this file the only owner of bottom-follow when the new flag is enabled.

Implementation changes:

- Add a local bottom-follow state machine:
  - `follow`
  - `detached`
- When new scroll mode is enabled, disable `maintainVisibleContentPosition`
- Keep manual prepend behavior for older messages
- Ensure only one path calls `scrollToEnd`

### `src/config/feature-flags.ts`

Add flags:

```ts
liveStreamText: false,
liveStreamVisibleOnlyFlush: true,
streamingPlainTextRenderer: true,
singleOwnerChatScroll: true,
```

### `src/perf/chat-metrics.ts`

Add metrics for:

- live flush cadence
- live commit count
- mismatch/conflict count
- auto-follow scroll events
- auto-follow detach events

---

## 6. Detailed Behavior Rules

### 6.1 Flush cadence

Keep transport flush unchanged in `src/api/events.ts`.

Add a second UI flush layer in `src/store/live-stream.ts`.

#### Default cadence

- iOS: `32ms`
- Android: `40ms`

#### Scheduling

- Use `requestAnimationFrame` when available.
- Keep a timeout fallback at the same cadence.
- Use one scheduler per active session.

#### Flush eligibility

Only flush a session when:

- the session has active live parts
- at least one relevant message is visible

#### Flush behavior

- Copy `rawText -> visibleText` only for eligible live parts.
- Batch all changes into one store update.
- Skip unchanged parts.
- If lag exceeds `600` chars, fast-forward on the next flush.
- If a hidden message becomes visible, snap `visibleText` to `rawText` on the next flush.

### 6.2 Autoscroll

When `singleOwnerChatScroll` is enabled, `src/components/chat/list.tsx` is the only file allowed to call `scrollToEnd` for streaming follow behavior.

#### States

- `follow`: user is at or near the bottom
- `detached`: user has intentionally moved away from bottom

#### Enter `follow`

- initial load completes
- user taps jump-to-bottom
- user scrolls back within `120px` of bottom
- user sends a message while already near bottom

#### Enter `detached`

- drag begins and distance from end exceeds `160px`
- jump button becomes visible

#### Rules while following

- auto-scroll no more than once every `48ms`
- use `scrollToEnd({ animated: false })`
- never auto-scroll while `loadingOlder` is true

#### Migration rule

- disable `maintainVisibleContentPosition` when new scroll mode is enabled
- do not keep mixed ownership

### 6.3 Markdown policy

#### Active assistant text

- render with `StreamingTextRenderer`
- preserve line breaks
- allow selection
- do not parse markdown

#### Completed assistant text

- render with `MarkdownRenderer`
- allow existing code blocks, links, tables, lists, and styling to appear after completion

#### Phase 1 intentionally does not support during active streaming

- fenced code highlighting
- tables
- inline markdown formatting
- tappable markdown links

This is a deliberate tradeoff for smoother live output.

### 6.4 Commit policy

Commit live text into canonical state on:

- `message.updated` with `time.completed`
- `session.idle`
- forced resync
- unsubscribe/reset

Commit order:

1. Build commits from live store.
2. Apply `_commitStreamParts(sessionID, commits)`.
3. Clear live entries.
4. Continue any existing forced reload/resync logic.

Never persist `visibleText`.

---

## 7. Feature Flags

Use small, composable flags for safe rollout.

| Flag                         | Default | Purpose                                  |
| ---------------------------- | ------- | ---------------------------------------- |
| `liveStreamText`             | `false` | Master switch for ephemeral live text    |
| `liveStreamVisibleOnlyFlush` | `true`  | Flush only visible streamed messages     |
| `streamingPlainTextRenderer` | `true`  | Use lightweight renderer for active text |
| `singleOwnerChatScroll`      | `true`  | Remove competing bottom-follow behavior  |

Recommended enable order:

1. `streamingPlainTextRenderer`
2. `singleOwnerChatScroll`
3. `liveStreamText`
4. `liveStreamVisibleOnlyFlush`

---

## 8. Metrics and Observability

Add telemetry and perf markers for both transport and UI reveal.

### Counters

- `chat:liveFlush`
- `chat:liveCommit`
- `chat:liveMismatch`
- `chat:autoFollowScroll`
- `chat:autoFollowDetached`

### Dimensions

- `sessionID`
- `messageID`
- `partID`
- `platform`
- `visibleParts`
- `flushedChars`
- `rawLagChars`
- `flushMs`
- `commits`
- `reason`

### Derived metrics

- time from first delta to first visible text
- average chars flushed per UI tick
- P95 UI flush duration
- P95 commit duration
- mismatch rate
- auto-follow detach rate during active responses

### Success thresholds

- P95 UI flush under `8ms`
- no full markdown parse during active assistant text
- no visible double-typing effect
- no visible text backtracking
- final committed text matches server output

---

## 9. Testing Plan

### Unit tests

#### `src/store/live-stream.ts`

- append delta to seeded part
- ignore unsupported fields
- flush only visible messages
- fast-forward when lag is too large
- commit single message
- commit whole session
- clear on remove and reset

#### `src/store/messages.ts`

- `_commitStreamParts` updates only targeted parts
- conflict resolution order is correct
- persistence is scheduled once per commit batch

### Integration tests

#### `src/api/events.ts`

- eligible text delta routes to live store
- non-text delta stays canonical
- completion triggers commit
- idle triggers session commit before reload

#### `src/components/chat/assistant-message.tsx` and `src/components/chat/part.tsx`

- active assistant text uses lightweight renderer
- completed assistant text upgrades to markdown
- reasoning follows the same rule
- tool/file/patch rendering remains unchanged

#### `src/components/chat/list.tsx`

- only one scroll owner is active
- follow/detached transitions are correct
- jump button appears only when detached
- loading older messages never forces bottom scroll

### Manual QA

- long prose response
- code-heavy markdown response
- reasoning-heavy response
- background the app during an active response, then return
- navigate away from a busy session, then return
- slow network with bursty SSE chunks
- very long session with many historical messages

---

## 10. Rollout Plan

### Phase 0: Instrumentation

- land all new paths behind flags
- ship metrics first
- keep behavior unchanged by default

### Phase 1: Renderer and scroll isolation

- enable `streamingPlainTextRenderer` internally
- enable `singleOwnerChatScroll` internally
- keep `liveStreamText` off

Goal: isolate renderer and scroll effects before changing data flow.

### Phase 2: Live stream store on iOS

- enable `liveStreamText` for internal iOS builds
- verify flush cost, mismatch rate, and user perception

### Phase 3: Live stream store on Android

- enable for internal Android builds
- compare performance and correctness against iOS

### Phase 4: Visible-only flush and cleanup

- enable `liveStreamVisibleOnlyFlush`
- remove old typed-streaming logic after one stable release cycle

---

## 11. Acceptance Criteria

Implementation is done when all are true:

- transport batching in `src/api/events.ts` is preserved
- canonical final content still lives in `src/store/messages.ts`
- active assistant `text` and `reasoning` no longer use `useTypedStreamingText`
- active assistant text does not run full markdown parsing on every delta
- visible assistant text updates on a stable UI cadence from ephemeral state
- hidden messages do not cause unnecessary per-frame work
- final completion commits back into canonical state exactly once
- existing retry, copy, load-more, hydration, tool, and diff behavior still works
- only one scroll policy owns bottom follow
- jump-to-bottom behavior remains predictable
- telemetry confirms lower active render work without correctness regressions

---

## 12. Risks and Fallback Plan

### Risks

- switching from plain active text to final markdown can cause one-time layout reflow
- active responses may look temporarily less rich because markdown is deferred
- reconnects or mixed snapshot/delta ordering can create commit mismatches
- scroll behavior can still regress if old paths remain partially enabled
- subscribing broadly to both canonical and live state can erase the intended performance win

### Fallback

- disable `liveStreamText` to return to canonical text-delta updates
- disable `streamingPlainTextRenderer` to restore current markdown behavior
- disable `singleOwnerChatScroll` to restore current scroll behavior
- keep code paths isolated so each flag can be reverted independently

---

## 13. Implementation Checklist

### Foundation

- [ ] Add `src/store/live-stream.ts`
- [ ] Add new feature flags in `src/config/feature-flags.ts`
- [ ] Add new metrics in `src/perf/chat-metrics.ts`

### Event routing

- [ ] Seed live parts from `message.part.updated`
- [ ] Route eligible `message.part.delta` events into live store
- [ ] Commit live text on message completion
- [ ] Commit live text on `session.idle`
- [ ] Clear live entries on message/part removal

### Canonical state

- [ ] Add `_commitStreamParts(sessionID, commits)` to `src/store/messages.ts`
- [ ] Preserve existing non-text delta behavior
- [ ] Schedule one persistence write per commit batch

### Rendering

- [ ] Add `useRenderableMessageParts(messageID)` in `src/api/hooks.ts`
- [ ] Update `src/components/chat/assistant-message.tsx` to use merged renderable parts
- [ ] Extend `PartRenderer` to support `liveText` and `renderMode`
- [ ] Add `StreamingTextRenderer` in `src/components/markdown/renderer.tsx`
- [ ] Remove `useTypedStreamingText`

### Scroll ownership

- [ ] Add viewability tracking in `src/components/chat/list.tsx`
- [ ] Publish visible message IDs to live stream store
- [ ] Add local follow/detached state machine
- [ ] Disable `maintainVisibleContentPosition` behind new scroll flag
- [ ] Ensure only one path calls `scrollToEnd`

### Validation

- [ ] Add unit tests for live stream store and stream commits
- [ ] Add integration tests for event routing and render mode transitions
- [ ] Run manual QA on iOS and Android

---

## 14. Recommendation

Implement this in phases, starting with renderer and scroll ownership cleanup before moving text deltas into the ephemeral live stream store. That sequence gives the best chance of improving perceived smoothness quickly while keeping rollback simple.
