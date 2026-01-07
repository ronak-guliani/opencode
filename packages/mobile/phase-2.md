# Phase 2: Enhanced Messaging & UI Improvements

**Status**: 🔄 IN PROGRESS

**Start Date**: December 30, 2025

---

## Overview

Phase 2 focuses on fixing the identified issues from Phase 1 and enhancing the messaging experience with better UI/UX and additional features.

---

## Goals

1. Fix message sending API format
2. Fix undefined message content handling
3. Verify SSE streaming works correctly
4. Enhance message display
5. Add session management features
6. Improve overall UI/UX

---

## Features Planned

### 1. Core Fixes (Priority)

- [x] Fix message sending API format (parts array) - Done in Phase 1
- [x] Fix undefined message content handling - Already had null check
- [x] Fix provider/model selection - Now uses server's connected providers
- [x] Fix SSE event handling - Updated to correct event names
- [x] Fix React key prop warnings - Added fallback key

### 2. Enhanced Message Display

- [ ] Rich text formatting
- [ ] Code syntax highlighting
- [ ] File attachments display
- [ ] Error message handling
- [ ] Markdown rendering

### 3. Session Management

- [ ] Delete sessions
- [ ] Rename sessions
- [ ] Session search/filter
- [ ] Session metadata display
- [ ] Session sorting

### 4. UI/UX Improvements

- [x] Safe area insets for header (notch/status bar)
- [x] Safe area insets for input area (home indicator)
- [ ] Loading states
- [ ] Error boundaries
- [ ] Pull-to-refresh
- [ ] Optimistic updates
- [ ] Toast notifications

### 5. Performance

- [ ] Message pagination
- [ ] Virtual scrolling
- [ ] Image lazy loading
- [ ] Debounced inputs

---

## Issues & Solutions

### Issue 1: ProviderModelNotFoundError - Hardcoded Model ID

**Date**: December 30, 2025

**Problem**: Message sending fails with `ProviderModelNotFoundError` because the app uses a hardcoded model ID that doesn't exist on the server.

**Error Message**:

```
ProviderModelNotFoundError: ProviderModelNotFoundError
data: {
  providerID: "anthropic",
  modelID: "claude-sonnet-4-5",
  suggestions: [],
}
```

**Root Cause**:

1. The session screen hardcodes `{ providerID: "anthropic", modelID: "claude-sonnet-4-5" }` when sending messages
2. The server's provider system validates models against what's actually configured/connected
3. `claude-sonnet-4-5` is not a valid model ID (typo - should be something like `claude-sonnet-4-20250514`)
4. Even if corrected, the server may have different providers connected (e.g., OpenAI instead of Anthropic)

**Solution Implemented**:

1. Created `src/store/provider.ts` - Zustand store to manage provider state
   - Fetches providers from server `/provider` endpoint
   - Caches connected providers and their default models
   - Provides `getDefaultModel()` to get first available model

2. Updated `src/api/client.ts`
   - Added `default` field to `listProviders()` return type

3. Updated `app/(app)/session/[id].tsx`
   - Imports and uses `useProviderStore`
   - Fetches providers on mount if not already loaded
   - Gets default model dynamically via `getDefaultModel()`
   - Displays current model in header (provider/model format)
   - Shows error banner if no provider connected
   - Added `modelError` state for user feedback

**New UI Elements**:

- Model label in header showing current provider/model
- Error banner when no providers are connected

**Files Modified**:

- `src/store/provider.ts` (NEW)
- `src/api/client.ts` (line 143-147)
- `app/(app)/session/[id].tsx` (multiple sections)

**Status**: ✅ COMPLETED

---

### Issue 2: Secondary JSON Parse Error

**Date**: December 30, 2025

**Problem**: After the model error, a secondary error occurs trying to parse the error response.

**Error Message**:

```
SyntaxError: JSON Parse error: Unexpected end of input
```

**Root Cause**: The error response from the server may not be valid JSON, or the response body is empty after the server throws `ProviderModelNotFoundError`.

**Solution**: This was resolved by fixing Issue 1 - the JSON parse error was a symptom of the model not found error, not a separate bug.

**Status**: ✅ RESOLVED (fixed by Issue 1 solution)

---

### Issue 3: Undefined Message Content (Pre-existing fix)

**Date**: December 30, 2025

**Problem**: Originally identified in Phase 1 - some messages have undefined content causing crashes.

**Solution**: Already fixed in Phase 1 - `StreamingText` component has null check:

```typescript
const safeText = text || ""
```

**Status**: ✅ ALREADY FIXED

---

## Testing Notes

<!-- Test results will be documented here -->

---

## Progress Log

### December 30, 2025

**Starting Phase 2** - Transitioning from Phase 1 completion.

**Issue Discovered**: Model hardcoding causes `ProviderModelNotFoundError`. The mobile app was using `claude-sonnet-4-5` (invalid) instead of fetching available models from the server.

**Key Insight**: In remote desktop mode, the server already has providers configured. The mobile app should:

1. Query `/provider` to get connected providers
2. Use the first connected provider's default model
3. Eventually add UI for model selection

**Implementation Completed**:

1. **Created Provider Store** (`src/store/provider.ts`)
   - Zustand store for managing provider state
   - `fetchProviders()` - fetches from server's `/provider` endpoint
   - `getDefaultModel()` - returns first connected provider's default model
   - `getModel()` - lookup specific model by provider/model ID
   - Tracks loading state and errors

2. **Updated API Client** (`src/api/client.ts`)
   - Added `default: Record<string, string>` to `listProviders()` return type

3. **Updated Session Screen** (`app/(app)/session/[id].tsx`)
   - Integrated `useProviderStore`
   - Auto-fetches providers on mount
   - Uses dynamic model from `getDefaultModel()` instead of hardcoded value
   - Displays current model in header
   - Shows error banner when no provider connected
   - Added styles: `headerCenter`, `modelLabel`, `errorBanner`, `errorText`

**Ready for Testing**: User can now test message sending - should use actual configured provider.

---

### Issue 4: SSE Events Using Wrong Event Names

**Date**: December 30, 2025

**Problem**: Messages sent but nothing appeared - app kept loading forever. SSE connection was open but events weren't being handled.

**Error Message**:

```
LOG  SSE connection opened
ERROR  Each child in a list should have a unique "key" prop.
```

**Root Cause**:
The mobile app was listening for fictional event names (`session.prompt.started`, `session.message.completed`) that don't exist in the OpenCode bus system.

**Actual OpenCode Events**:

- `message.updated` - When a message is created/updated (contains full message info)
- `message.part.updated` - When a message part is updated (streaming text, tool calls, etc.)
- `session.status` - When session status changes (idle, running, etc.)

**Old Implementation** (WRONG):

```typescript
if (event.type === "session.prompt.started") { ... }
if (event.type === "session.message.completed") { ... }
```

**New Implementation** (CORRECT):

```typescript
if (event.type === "message.updated") {
  // Handle new/updated messages
}
if (event.type === "message.part.updated") {
  // Handle streaming text updates
}
if (event.type === "session.status") {
  // Handle status changes (set isSending = false when idle)
}
```

**Files Modified**:

- `app/(app)/session/[id].tsx` - SSE event handling

**Status**: ✅ COMPLETED

---

### Issue 5: React Key Prop Warning

**Date**: December 30, 2025

**Problem**: React warning about unique key props in message list.

**Error Message**:

```
Each child in a list should have a unique "key" prop.
Check the render method of `ScrollView`. It was passed a child from TerminalScreen.
```

**Root Cause**: Some messages might have undefined or duplicate IDs.

**Solution**: Added fallback key using index:

```typescript
{messages.map((message, index) => (
  <MessageBubble key={message.id || `msg-${index}`} message={message} />
))}
```

**Files Modified**:

- `src/components/Terminal.tsx`

**Status**: ✅ COMPLETED

---

### Issue 6: Header Cut Off by Device Notch

**Date**: December 30, 2025

**Problem**: Session header with "← Sessions" button and title was positioned too high, getting cut off by device notch/status bar.

**Solution**: Added safe area insets handling using `useSafeAreaInsets()` hook:

- Applied `paddingTop: insets.top + 16` to header
- Applied `paddingBottom: insets.bottom` to input container

**Files Modified**:

- `app/(app)/session/[id].tsx`

**Status**: ✅ COMPLETED

---

### Issue 7: Duplicate Messages in Chat

**Date**: December 30, 2025

**Problem**: Multiple user and assistant bubbles appearing instead of single request/response. Same message appearing multiple times causing duplicate key errors.

**Error Message**:

```
ERROR  Encountered two children with the same key, `msg_b71d49aa3001p7ujsH64GwP7u1`. Keys should be unique...
```

**Root Cause**:

1. `message.updated` event fires multiple times for the same message (on creation and updates)
2. `addMessage()` always appended to array without checking if message already exists
3. No deduplication logic in the store

**Solution**:

1. Added `upsertMessage()` function to session store that checks if message exists before adding:
   - If exists: updates the existing message
   - If not: adds new message
2. Added `updateMessage()` function for partial updates (used by `message.part.updated`)
3. Changed SSE handler to use `upsertMessage()` instead of `addMessage()`
4. Simplified `message.part.updated` handler to use `updateMessage()`

**Files Modified**:

- `src/store/session.ts` - Added `upsertMessage()` and `updateMessage()` functions
- `app/(app)/session/[id].tsx` - Use new store functions, removed debug logging

**Status**: ✅ COMPLETED

---

### Issue 8: Session History Not Loading & Empty Assistant Bubble

**Date**: December 30, 2025

**Problem**:

1. When navigating back to sessions and re-entering a session, history doesn't load correctly
2. Only see a single empty assistant bubble instead of actual message content
3. Assistant responses not appearing after sending messages

**Root Cause**:

1. **API Response Format Mismatch**: Server returns `MessageV2.WithParts` format:
   ```json
   { "info": { "id": "...", "role": "...", ... }, "parts": [{ "type": "text", "text": "..." }] }
   ```
   But mobile app expected flat `Message` format:
   ```json
   { "id": "...", "role": "...", "content": "..." }
   ```
2. **Messages were cleared but then re-populated incorrectly** - the raw API response wasn't being transformed

**Solution**:

1. Added new types to `client.ts`:
   - `MessageWithParts` - matches server's `MessageV2.WithParts` schema
   - `extractTextFromParts()` - extracts text content from parts array
   - `messageWithPartsToMessage()` - transforms server format to mobile format

2. Updated `getMessages()` to transform response:

   ```typescript
   async getMessages(sessionId: string): Promise<Message[]> {
     const raw = await this.request<MessageWithParts[]>(...)
     return raw.map(messageWithPartsToMessage)
   }
   ```

3. Added comprehensive logging with `[API]`, `[Session]`, `[SSE]` prefixes:
   - API raw responses and transformations
   - Session loading steps
   - SSE event handling
   - Message send/receive

4. Fixed `loadSession()` to clear messages BEFORE loading:
   ```typescript
   clearMessages() // Clear first
   const messages = await client.getMessages(id)
   messages.forEach((msg) => upsertMessage(msg))
   ```

**Files Modified**:

- `src/api/client.ts` - Added types and transformation functions
- `app/(app)/session/[id].tsx` - Added logging, fixed load order

**Status**: ✅ COMPLETED

---

## Testing Notes

**Logging added** - Check console for:

- `[API] getMessages raw response:` - Server response
- `[API] getMessages transformed:` - After transformation
- `[Session] Loading session:` - Session load start
- `[Session] Got messages count:` - Number of messages
- `[SSE] message.updated:` - Real-time message events
- `[SSE] message.part.updated:` - Streaming content updates
- `[SSE] session.status:` - Status changes (idle = done)

---

## Progress Log

### December 30, 2025

**Starting Phase 2** - Transitioning from Phase 1 completion.
