# Chat Reliability TODOs

Updated: 2026-02-26

## P0 (Fixed)

- [x] Diff card showed too often (including turns with no file changes).
- [x] Chat did not reliably start at the bottom on first load/hydration.
- [x] Upward pagination could lock in a "loading more" state.
- [x] Missing SSE events could leave completed responses stale in chat.
- [x] Markdown typed streaming caused lag/flicker for complex markdown.

## P1 (Next)

- [ ] Validate spacing/line-height polish across user text, markdown paragraphs, and collapsible tool rows on small screens.
- [ ] Add a small manual QA pass for large markdown payloads (tables, long code fences, nested lists) on iOS and Android.
- [ ] Add lightweight runtime telemetry for chat scroll jumps and message re-sync frequency to catch regressions early.
