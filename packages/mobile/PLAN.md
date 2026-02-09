# OpenCode Mobile — React Native (Expo) App Plan

> Inspired by [how Vercel built the v0 iOS app](https://vercel.com/blog/how-we-built-the-v0-ios-app).
> Same philosophy: earn a spot on the Home Screen among the greats.

## Overview

A React Native app built with Expo that connects to a running opencode server (locally or via reverse proxy like ngrok). It provides a fast, native mobile interface for viewing sessions, reading/sending messages, and managing settings.

The app does **not** run opencode itself — it is a thin client that talks to an already-running opencode server over HTTP + SSE, using the existing `@opencode-ai/sdk` package (auto-generated from the server's OpenAPI spec via `@hey-api/openapi-ts` — same toolchain v0 uses).

---

## Architecture

```
┌──────────────────────────────────┐
│  React Native (Expo) App         │
│                                  │
│  ┌────────────┐  ┌────────────┐  │
│  │  Screens   │  │  Components│  │
│  └─────┬──────┘  └─────┬──────┘  │
│        │               │         │
│  ┌─────▼───────────────▼──────┐  │
│  │     Zustand Store          │  │
│  │  (sessions, messages, etc) │  │
│  └─────────────┬──────────────┘  │
│                │                 │
│  ┌─────────────▼──────────────┐  │
│  │  SDK + SSE Event Layer     │  │
│  │  (@opencode-ai/sdk)        │  │
│  └─────────────┬──────────────┘  │
│                │                 │
└────────────────┼─────────────────┘
                 │ HTTPS
                 ▼
         opencode server
      (local / ngrok / etc.)
```

### Why these choices

| Decision                             | Rationale                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expo Router (file-based)**         | Convention over config, fast iteration, deep linking for free                                                                                 |
| **Zustand**                          | Minimal boilerplate, no providers, works outside React tree, excellent perf with selectors. v0 uses Zustand-like patterns for similar reasons |
| **React Native Reanimated 3**        | UI-thread animations (60/120fps). v0 uses shared values everywhere to avoid re-renders                                                        |
| **react-native-keyboard-controller** | Battle-tested by v0 team. Handles iOS keyboard edge cases, interactive dismissal, `KeyboardStickyView` for the floating composer              |
| **LegendList**                       | v0's choice over FlashList for chat. Handles dynamic heights, frequent updates from streaming, and `contentInset` for blank-size management   |
| **@opencode-ai/sdk**                 | Auto-generated from OpenAPI spec. Types, endpoints, SSE — all handled. Same approach as v0's Platform API                                     |
| **react-native-unistyles**           | Theming without re-renders or React Context. v0's styling choice for performance                                                              |
| **@callstack/liquid-glass**          | Official Liquid Glass for React Native. Auto-renders glass on iOS 26+, interactive morphing via `LiquidGlassContainerView`                    |
| **Zeego**                            | Native `UIMenu` context menus. Auto-renders Liquid Glass menus on iOS 26                                                                      |

---

## Tech Stack

| Layer               | Library                                              | Purpose                                                                |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Framework           | Expo SDK 52+                                         | Managed workflow, OTA updates, dev tools                               |
| Navigation          | expo-router v4                                       | File-based routing, layouts, deep links                                |
| State               | zustand                                              | Global store slices for sessions/messages/settings                     |
| Data fetching       | @opencode-ai/sdk                                     | REST + SSE, auto-generated types from OpenAPI                          |
| Animations          | react-native-reanimated 3                            | UI-thread animations via shared values and worklets                    |
| Gestures            | react-native-gesture-handler                         | Swipe, pan, long-press                                                 |
| Keyboard            | react-native-keyboard-controller                     | `KeyboardStickyView`, `useKeyboardHandler`, interactive dismiss        |
| Chat list           | @legendapp/list (LegendList)                         | Dynamic-height virtualized list. `contentInset` support for blank-size |
| Styling             | react-native-unistyles                               | Zero-re-render theming, `StyleSheet.create`-like API                   |
| Markdown            | react-native-markdown-display                        | CommonMark + GFM rendering with custom rules                           |
| Syntax highlighting | react-syntax-highlighter                             | Code block coloring inside markdown                                    |
| Liquid Glass        | @callstack/liquid-glass                              | Native iOS 26 Liquid Glass with `LiquidGlassView`                      |
| Native menus        | zeego                                                | Native `UIMenu` context menus, auto Liquid Glass on iOS 26             |
| Bottom sheets       | React Native modal (`presentationStyle="formSheet"`) | Native iOS sheet with drag-to-dismiss                                  |
| Persistence         | zustand/middleware (persist) + expo-secure-store     | Server URL, auth, preferences                                          |
| Haptics             | expo-haptics                                         | Tactile feedback on interactions                                       |

---

## Project Structure

```
packages/mobile/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout (providers, global SSE)
│   ├── index.tsx                 # Redirect → connect or sessions
│   ├── connect.tsx               # Server connection screen
│   └── (main)/                   # Connected group
│       ├── _layout.tsx           # Drawer layout (sidebar + content)
│       ├── settings.tsx          # Settings screen (modal/sheet)
│       └── session/
│           ├── index.tsx         # Empty state (no session selected)
│           └── [id].tsx          # Session chat view
├── src/
│   ├── components/
│   │   ├── chat/                 # Chat experience (core of the app)
│   │   │   ├── provider.tsx      # ChatProvider: composable context providers
│   │   │   ├── list.tsx          # MessagesList: LegendList + composable hooks
│   │   │   ├── user-message.tsx  # User message bubble + first-message animation
│   │   │   ├── assistant-message.tsx  # Assistant message + staggered fade-in
│   │   │   ├── optimistic.tsx    # Optimistic placeholder while waiting for response
│   │   │   ├── part.tsx          # Part renderer (text, tool, file, step, etc.)
│   │   │   ├── composer.tsx      # Floating Liquid Glass composer
│   │   │   └── hooks/            # Composable chat behavior hooks
│   │   │       ├── use-first-message-animation.ts
│   │   │       ├── use-message-blank-size.ts
│   │   │       ├── use-keyboard-aware-list.ts
│   │   │       ├── use-scroll-from-composer-size.ts
│   │   │       ├── use-initial-scroll-to-end.ts
│   │   │       └── use-message-list-props.ts
│   │   ├── markdown/             # Markdown renderer + code blocks
│   │   │   ├── renderer.tsx      # Main markdown component
│   │   │   ├── code-block.tsx    # Syntax-highlighted code block
│   │   │   └── fade-in.tsx       # Staggered fade-in for streaming content
│   │   ├── sidebar/              # Drawer sidebar
│   │   │   ├── index.tsx         # Sidebar container
│   │   │   ├── header.tsx        # Project name + path header
│   │   │   ├── session-item.tsx  # Session row (swipe-to-archive)
│   │   │   └── session-group.tsx # Date-grouped session list
│   │   ├── glass.tsx             # Liquid Glass wrapper (LiquidGlassView)
│   │   ├── skeleton.tsx          # Loading skeleton
│   │   └── status.tsx            # Status indicator (idle/busy/retry)
│   ├── store/                    # Zustand stores
│   │   ├── connection.ts         # Server URL, auth, connection state
│   │   ├── sessions.ts           # Sessions list, current session, statuses
│   │   ├── messages.ts           # Messages + parts per session
│   │   └── settings.ts           # App preferences (theme, providers)
│   ├── api/                      # SDK wrappers + SSE
│   │   ├── client.ts             # createOpencodeClient wrapper
│   │   ├── events.ts             # SSE subscription, coalescing, event reducer
│   │   ├── bootstrap.ts          # Two-phase bootstrap logic
│   │   └── hooks.ts              # Thin hooks over Zustand selectors
│   ├── theme/                    # Unistyles theming
│   │   ├── index.ts              # UnistylesRegistry setup
│   │   ├── tokens.ts             # Spacing, radii, typography scales
│   │   ├── dark.ts               # Dark palette
│   │   └── light.ts              # Light palette
│   ├── animation/                # Reusable animation primitives
│   │   ├── fade-in-staggered.tsx # Pool-based staggered fade (v0 pattern)
│   │   ├── text-fade-in.tsx      # Word-level staggered text fade
│   │   └── pool.ts              # createUsePool — limits concurrent animations
│   └── util/
│       ├── binary.ts             # Binary search for sorted arrays
│       └── format.ts             # Date, token count formatters
├── patches/                      # React Native patches (keyboard, TextInput)
├── assets/                       # Static assets (icons, fonts)
├── app.json                      # Expo config
├── unistyles.ts                  # Unistyles global config
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── package.json
```

---

## Data Flow

### 1. Connection

On first launch, the user enters the server URL (e.g., `https://abc.ngrok.io`) and optional basic-auth credentials. These are persisted in `expo-secure-store`. The app calls `GET /global/health` to verify connectivity, then bootstraps.

### 2. Bootstrap (mirrors the web app's two-phase approach)

**Phase 1 — Blocking (must succeed before UI renders):**

- `GET /global/health` — verify server
- `GET /project/current` — current project info
- `GET /provider` — available providers
- `GET /config` — app config

**Phase 2 — Non-blocking (load in background, show skeleton):**

- `GET /session?limit=30` — recent sessions
- `GET /session/status` — all session statuses
- `GET /permission` — pending permissions
- `GET /question` — pending questions

Status transitions: `"loading"` → `"partial"` → `"complete"`.

### 3. SSE Event Stream

After bootstrap, open a persistent connection to `GET /event` (or `GET /global/event` for multi-project). Events are:

1. **Received** as `GlobalEvent { directory, payload: Event }`
2. **Coalesced** — high-frequency events (`session.status`, `message.part.updated`) are deduplicated by computed key within the batch window
3. **Batched** — flushed at ~16ms intervals (frame-aligned, same as the web app and v0)
4. **Applied** via a reducer that uses binary search for O(log n) inserts into sorted arrays

### 4. Sending a Message

```
User types message → taps send
  1. Optimistically insert user message into store
  2. Trigger first-message animation (if new chat) via Reanimated shared value
  3. POST /session/{id}/message (streaming)
  4. Insert optimistic-placeholder for assistant response
  5. SSE events arrive → reducer updates parts in real-time
  6. Parts fade in with staggered animation as they stream
  7. Scroll behavior managed by blank-size + contentInset
```

---

## Screens & Navigation

### Navigation Structure

```
Root Layout (_layout.tsx)
├── Connect Screen (if not connected)
└── (main) group
    └── Drawer Layout
        ├── Sidebar (left drawer)
        │   ├── Project Header (name + path)
        │   ├── Session List (LegendList, grouped by date)
        │   └── Settings button (bottom)
        └── Main Content
            ├── Session Chat View (messages + composer)
            └── Settings (presented as formSheet modal)
```

### Screen Details

#### Connect Screen (`connect.tsx`)

- Text input for server URL
- Optional username/password fields
- "Connect" button → health check → navigate to sessions
- Recent servers list (persisted)
- Animated connection status indicator

#### Session Chat View (`session/[id].tsx`)

The centerpiece of the app. Follows v0's composable chat architecture:

```tsx
export function ChatScreen({ sessionId }) {
  const messages = useMessages(sessionId)
  return (
    <ChatProvider key={sessionId}>
      <MessagesList messages={messages} />
      <Composer sessionId={sessionId} />
    </ChatProvider>
  )
}
```

**ChatProvider** wraps composable context providers:

```tsx
export function ChatProvider({ children }) {
  return (
    <ComposerHeightProvider>
      <MessageListProvider>
        <NewMessageAnimationProvider>
          <KeyboardStateProvider>{children}</KeyboardStateProvider>
        </NewMessageAnimationProvider>
      </MessageListProvider>
    </ComposerHeightProvider>
  )
}
```

**MessagesList** uses LegendList (not inverted) with composable hooks:

```tsx
function MessagesList({ messages }) {
  useKeyboardAwareMessageList()
  useScrollMessageListFromComposerSizeUpdates()
  const { animatedProps, ref, onContentSizeChange, onScroll } = useMessageListProps()

  return (
    <AnimatedLegendList
      animatedProps={animatedProps}
      ref={ref}
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        if (item.role === "user") return <UserMessage message={item} index={index} />
        if (item.role === "assistant") return <AssistantMessage message={item} index={index} />
        if (item.role === "optimistic-placeholder") return <OptimisticAssistantMessage index={index} />
      }}
    />
  )
}
```

**Message rendering**:

- **User messages**: Bubble with `useFirstMessageAnimation` (fade + slide to top on first send)
- **Assistant messages**: Staggered fade-in after user animation completes. Parts rendered individually (text, tool calls, file diffs, reasoning, steps)
- **Tool call parts**: Expandable cards showing tool name, arguments, status, output
- **Code blocks**: Syntax-highlighted, horizontally scrollable, copy button
- **Streaming**: `FadeInStaggeredIfStreaming` wraps content — pool-limited concurrent animations

**Composer**: Floating Liquid Glass input:

- `position: absolute; bottom: 0` wrapped in `KeyboardStickyView`
- Composer height tracked via shared value, added to `contentInset.bottom`
- Multiline TextInput with native patch (no scroll indicators, no bounce, interactive keyboard dismiss, swipe-up-to-focus)
- `useScrollWhenComposerSizeUpdates` — when user types new lines and is scrolled to end, shifts content up

**Why not inverted list**: v0 found inverted incompatible with high-frequency streaming updates. Instead:

- `scrollToEnd()` on chat open (called multiple times with `requestAnimationFrame`/`setTimeout` to handle dynamic heights)
- `contentInset` via `useAnimatedProps` for blank-size (pushes content to top of screen)
- "Scroll to end" button appears when user scrolls up during streaming

#### Sidebar (`sidebar/index.tsx`)

```
┌─────────────────────────┐
│  opencode               │  ← project name (bold, large)
│  ~/code/opencode        │  ← directory path (muted, smaller)
├─────────────────────────┤
│  Today                  │
│   ● Fix type errors     │  ← session title, ● = status dot
│   ● Add dark mode       │
│  Yesterday              │
│   ○ Refactor auth       │  ○ = idle
│   ○ Update docs         │
│  ...                    │
├─────────────────────────┤
│  ⚙ Settings             │
└─────────────────────────┘
```

- Sessions grouped by relative date (Today, Yesterday, This Week, etc.)
- Status dot colors: green = idle, yellow = busy, red = error
- Swipe-to-archive on session rows (gesture-handler)
- Long-press → native context menu via Zeego (archive, delete, share)
- Pull-to-refresh
- Tap to select → closes drawer on phone, stays open on tablet

#### Settings Screen (`settings.tsx`)

- Presented as native `formSheet` modal (drag-to-dismiss)
- **Server**: Current URL, disconnect button, connection status
- **Appearance**: Theme (light/dark/system)
- **Providers**: List of configured providers with auth status
- **About**: Version, server version

---

## Chat Animation System (v0 Pattern)

### First Message Animation

When user sends the first message in a new chat:

1. `onSubmit` sets `isMessageSendAnimating` shared value to `true`
2. `useFirstMessageAnimation` hook in `UserMessage`:
   - Synchronously measures message height via `ref.current.measure()` (New Architecture)
   - Calculates start/end states based on message height, window height, keyboard height
   - Animates `translateY` (withSpring) and opacity `progress` (withTiming)
   - On completion, sets `isMessageSendAnimating` to `false`
3. `AssistantMessage` watches `didUserMessageAnimate` derived value
   - When true, fades in with `withTiming(1, { duration: 350 })`

### Streaming Content Fade-In

Pool-based staggered animation system (directly from v0):

```
createUsePool(limit) → useIsAnimatedInPool() → { isActive, evict }
```

- `FadeInStaggered`: wraps content, renders `<FadeIn>` if pool slot is active, evicts on completion
- `TextFadeInStaggered`: chunks text into words, each word gets its own pool slot
- Pool limit of 4 for text (no more than 4 words fading at once)
- Stagger delay of 32ms between elements
- When queue > 10 items, batch size increases dynamically
- `DisableFadeProvider` prevents re-animating already-seen content when switching chats

### Blank Size (contentInset)

The space below the last message that pushes content to the top of the screen:

```tsx
const animatedProps = useAnimatedProps(() => ({
  contentInset: {
    bottom: blankSize.get() + composerHeight.get() + keyboardHeight.get(),
  },
}))
```

- Updated on UI thread via `useAnimatedProps` (no re-renders)
- Recalculated whenever assistant message height changes (`onLayout`)
- `useMessageBlankSize` hook measures assistant message + preceding user message to compute the gap

### Keyboard Handling

`useKeyboardAwareMessageList` — ~1000 lines of keyboard management:

- Uses `useKeyboardHandler` (onStart, onEnd, onInteractive) from react-native-keyboard-controller
- Shrinks blank-size when keyboard opens
- If scrolled to end with no blank-size → shift content up
- If scrolled high up → keyboard appears on top without shifting
- Interactive dismiss via scroll view
- Dedupes repeat keyboard events (iOS fires onEnd 3x when returning from background)

---

## Liquid Glass

Uses `@callstack/liquid-glass` — the real iOS 26 Liquid Glass, not a blur approximation.

### Composer (iMessage-style)

```tsx
<LiquidGlassContainerView spacing={8}>
  <LiquidGlassView interactive>
    <TextInput multiline />
  </LiquidGlassView>
  <LiquidGlassView interactive>
    <SendButton />
  </LiquidGlassView>
</LiquidGlassContainerView>
```

`LiquidGlassContainerView` provides the interactive morphing effect between sibling glass views (same as iMessage toolbar in iOS 26).

### Other surfaces

- **Sidebar header**: Glass background behind project name/path
- **Navigation bar**: Glass header bar
- **Context menus**: Automatic via Zeego + iOS 26
- **Bottom sheet handle area**: Glass tint

### Android fallback

On Android (or iOS < 26), fall back to `expo-blur` `<BlurView>` with `intensity={80}` and semi-transparent background.

---

## Markdown Rendering

Requirements:

- Full CommonMark + GFM (tables, task lists, strikethrough)
- Syntax-highlighted code blocks (TypeScript, Python, Bash, JSON, and more)
- Inline code styling
- Copy-to-clipboard on code blocks
- Staggered fade-in during streaming (integrated with animation pool)

Approach:

- `react-native-markdown-display` for parsing and rendering
- Custom `rules` prop to override:
  - **Code blocks**: `react-syntax-highlighter` with `oneDark` theme, wrapped in horizontal `ScrollView`, copy button overlay
  - **Text nodes**: Wrapped in `<TextFadeInStaggeredIfStreaming>` during streaming
  - **Links**: Wrapped in fade component, open via `Linking.openURL`
- Memoize rendered markdown per message ID + content hash to prevent re-renders

---

## Styling (Unistyles)

`react-native-unistyles` provides theming without re-renders. No React Context for styles.

```ts
// unistyles.ts
UnistylesRegistry.addThemes({ light: lightTheme, dark: darkTheme }).addConfig({ adaptiveThemes: true }) // follows system

// usage in any component
const { styles } = useStyles(stylesheet)

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
}))
```

Theme tokens:

- Colors (background, surface, text, accent, status colors)
- Spacing scale (4, 8, 12, 16, 24, 32, 48)
- Typography (font sizes, weights, line heights)
- Radii (sm, md, lg, xl)

---

## Native Elements (Not JS Components)

Following v0's approach — use native UI elements wherever possible:

| Element       | Implementation                           |
| ------------- | ---------------------------------------- |
| Context menus | Zeego → native `UIMenu`                  |
| Alerts        | React Native `Alert` (with iOS 26 patch) |
| Bottom sheets | RN Modal `presentationStyle="formSheet"` |
| Action sheets | Zeego dropdown menu                      |
| Haptics       | `expo-haptics` on key interactions       |

No heavy JS-based component library. Custom components only where native doesn't cover it.

---

## State Management (Zustand)

### Store Slices

```ts
// store/connection.ts
interface ConnectionStore {
  url: string | null
  status: "disconnected" | "connecting" | "connected" | "error"
  error: string | null
  directory: string | null
  connect(url: string, auth?: { username: string; password: string }): Promise<void>
  disconnect(): void
}

// store/sessions.ts
interface SessionStore {
  sessions: Session[] // sorted by id (matches web app's binary search pattern)
  statuses: Record<string, SessionStatus>
  current: string | null // selected session ID
  total: number
  select(id: string): void
  fetch(limit?: number): Promise<void>
  create(): Promise<Session>
  archive(id: string): Promise<void>
  delete(id: string): Promise<void>
  // Called by event reducer:
  _upsert(session: Session): void
  _remove(id: string): void
  _setStatus(id: string, status: SessionStatus): void
}

// store/messages.ts
interface MessageStore {
  // Keyed by sessionID
  messages: Record<string, MessageWithParts[]>
  parts: Record<string, Part[]> // keyed by messageID
  send(sessionID: string, content: string): Promise<void>
  load(sessionID: string): Promise<void>
  abort(sessionID: string): Promise<void>
  // Called by event reducer:
  _upsertMessage(sessionID: string, message: Message): void
  _upsertPart(messageID: string, part: Part): void
  _removeMessage(sessionID: string, messageID: string): void
  _removePart(messageID: string, partID: string): void
}

// store/settings.ts
interface SettingsStore {
  theme: "light" | "dark" | "system"
  config: Config | null
  providers: Provider[]
  setTheme(t: "light" | "dark" | "system"): void
  fetchConfig(): Promise<void>
  fetchProviders(): Promise<void>
}
```

### Persistence

- `connection.url` → `expo-secure-store` (encrypted)
- `connection.auth` → `expo-secure-store` (encrypted)
- `settings.theme` → `AsyncStorage` via zustand persist middleware
- `sessions` → not persisted (re-fetched on connect)

---

## SSE Event Handling

Mirrors the web app's architecture, adapted for React Native:

```ts
// api/events.ts — conceptual
async function subscribe(client: OpencodeClient) {
  const { stream } = await client.event()
  const queue: Event[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    const batch = queue.splice(0)
    for (const event of batch) {
      applyEvent(event) // routes to correct store slice
    }
    timer = null
  }

  for await (const event of stream) {
    coalesce(queue, event) // dedup high-frequency events by key
    if (!timer) timer = setTimeout(flush, 16) // frame-aligned flush
  }
}
```

Event types routed to stores:

| Event                  | Store    | Action           |
| ---------------------- | -------- | ---------------- |
| `session.created`      | sessions | `_upsert`        |
| `session.updated`      | sessions | `_upsert`        |
| `session.deleted`      | sessions | `_remove`        |
| `session.status`       | sessions | `_setStatus`     |
| `message.updated`      | messages | `_upsertMessage` |
| `message.removed`      | messages | `_removeMessage` |
| `message.part.updated` | messages | `_upsertPart`    |
| `message.part.removed` | messages | `_removePart`    |

Auto-reconnect with exponential backoff on disconnect. Connection status banner shown in UI.

---

## Performance Rules

Learned from v0 and adapted to our needs:

1. **Shared values over state** — animation state lives in Reanimated shared values, never triggers re-renders
2. **useAnimatedProps for list** — `contentInset` and other list props updated on UI thread
3. **No inline styles in lists** — all styles via `createStyleSheet` (Unistyles) or `useAnimatedStyle`
4. **Memoize list items** — `React.memo` on every `renderItem` component
5. **Selector-based re-renders** — Zustand selectors ensure components only re-render when their slice changes
6. **Unistyles for theming** — theme changes don't trigger React re-renders
7. **Pool-limited animations** — max N concurrent fade animations via `createUsePool`, prevents animation storms during fast streaming
8. **Lazy load screens** — settings and connect screens code-split
9. **Skeleton screens** — show placeholders immediately during bootstrap phase 2
10. **Message parts individually keyed** — only the changed part re-renders, not the entire message
11. **LegendList recycling** — set `estimatedItemSize` based on average message height
12. **Synchronous measurement** — New Architecture enables `measure()` in `useLayoutEffect` without delay

---

## TextInput Patch

Following v0, patch `RCTUITextView.mm` to make the multiline TextInput feel native:

- Disable scroll indicators (`showsVerticalScrollIndicator = NO`)
- Remove bounce effects (`bounces = NO`, `alwaysBounceVertical = NO`)
- Enable interactive keyboard dismissal (`keyboardDismissMode = UIScrollViewKeyboardDismissModeInteractive`)
- Add pan gesture to focus (swipe up on input opens keyboard)

Patch lives in `patches/` and is applied via `patch-package`.

---

## API Layer

### SDK Client Wrapper

```ts
// api/client.ts
import { createOpencodeClient } from "@opencode-ai/sdk"

function create(url: string, directory?: string) {
  return createOpencodeClient({
    baseUrl: url,
    directory,
    headers: connectionStore.getState().auth
      ? { Authorization: `Basic ${btoa(...)}` }
      : undefined,
  })
}
```

### React Hooks

```ts
// api/hooks.ts — thin hooks over Zustand selectors

function useSessions() {
  return useSessionStore((s) => s.sessions)
}

function useSession(id: string) {
  return useSessionStore((s) => s.sessions.find((s) => s.id === id))
}

function useMessages(sessionID: string) {
  return useMessageStore((s) => s.messages[sessionID] ?? [])
}

function useSessionStatus(id: string) {
  return useSessionStore((s) => s.statuses[id])
}
```

---

## Implementation Phases

### Phase 1 — Foundation (MVP)

1. Initialize Expo project with expo-router, New Architecture enabled
2. Set up project structure, TypeScript config, Unistyles theming
3. Implement connection store + connect screen
4. Wire up SDK client + health check
5. Implement two-phase bootstrap
6. Implement SSE event subscription with coalescing
7. Implement sessions store + sidebar with session list (LegendList)
8. Implement session chat view with `ChatProvider` + composable hooks
9. Basic message rendering (user bubbles, assistant text)
10. Floating composer with `KeyboardStickyView`
11. Message sending + optimistic updates

**Milestone: Connect to server, see sessions, read and send messages. Keyboard handling works.**

### Phase 2 — Chat Polish

1. `useFirstMessageAnimation` — first message fade + slide
2. `useMessageBlankSize` + `contentInset` for scroll-to-top
3. `useKeyboardAwareMessageList` — full keyboard management
4. `useInitialScrollToEnd` — existing chats start scrolled to end
5. `useScrollWhenComposerSizeUpdates` — content shifts as composer grows
6. Staggered fade-in animation system (`createUsePool`, `FadeInStaggered`, `TextFadeInStaggered`)
7. `DisableFadeProvider` — don't re-animate seen content
8. Markdown rendering with syntax-highlighted code blocks
9. Tool call / file change part rendering (expandable cards)
10. Permission + question banners

**Milestone: Chat feels native and smooth. Streaming content fades in beautifully.**

### Phase 3 — Native Feel

1. TextInput native patch (no bounce, interactive dismiss, swipe-to-focus)
2. Liquid Glass composer via `@callstack/liquid-glass`
3. Liquid Glass sidebar header + nav bar
4. Zeego context menus on session items (archive, delete, share)
5. Native formSheet modal for settings
6. Haptic feedback on send, swipe, menu open
7. Swipe-to-archive on session rows
8. Session status indicators (animated dots)
9. Skeleton loading states

**Milestone: App feels like it belongs on iOS. Liquid Glass throughout.**

### Phase 4 — Settings & Refinement

1. Settings screen (server info, theme picker, providers list)
2. Dark/light/system theme
3. Pull-to-refresh on sessions
4. Session search
5. Auto-reconnect SSE with exponential backoff + connection banner
6. Error handling and edge cases (server unreachable, auth failures)

**Milestone: Feature-complete v1.**

### Phase 5 — Advanced (Post-v1)

1. Multi-project support (project switcher in sidebar)
2. Session diffs viewer
3. Tablet layout (persistent sidebar, split view)
4. Offline indicator
5. Push notifications (optional)

---

## Key Risks & Mitigations

| Risk                                            | Mitigation                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SSE `ReadableStream` support in React Native    | SDK uses `fetch` + `ReadableStream`. Verify on Hermes. Fall back to `EventSource` polyfill if needed            |
| LegendList maturity                             | v0 uses it in production. Pin version, collaborate upstream on issues (same as v0 team does)                    |
| `contentInset` + blank-size edge cases          | Follow v0's exact pattern. Multiple `scrollToEnd` calls with `requestAnimationFrame`/`setTimeout` as safety net |
| Keyboard handling fragility across iOS versions | Use `react-native-keyboard-controller` (actively maintained, v0 team contributes fixes). Pin iOS SDK version    |
| Liquid Glass Android support                    | `@callstack/liquid-glass` is iOS-only. Fall back to `expo-blur` on Android                                      |
| Markdown performance with long messages         | Memoize rendered output per message ID + content hash. LegendList recycles cells                                |
| ngrok connection drops                          | Auto-reconnect SSE with exponential backoff. Show persistent connection status banner                           |
| Large session histories (1000+ messages)        | Paginate messages via API. Only load visible window + buffer                                                    |

---

## Non-Goals (for initial release)

- Running opencode server from the phone
- Terminal/PTY access from mobile
- File editing from mobile
- MCP server management
- OAuth flows for providers (configure on desktop)
- Feature parity with the web app — this is a focused, fast mobile companion
