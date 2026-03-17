# Interview Helper V2 — Feature Design Spec

**Date:** 2026-03-15
**Status:** Approved

## Overview

Version 2 adds four features to the Interview Helper PWA:

1. **Scroll-to-bottom button** — lets users scroll back down after reading earlier messages
2. **Model & API key configuration** — users pick a provider/model and enter their own API key from the UI
3. **Chat history** — the last 10 conversations are persisted and accessible from a sidebar
4. **New chat** — users can start a fresh conversation at any time

## Architecture

**Approach: Thin Server (client-owns-state)**

All user state (chats, settings, API keys) lives in the browser via `localStorage`. The Express server remains a stateless proxy — it receives the provider, model, API key, and messages on each request, routes to the correct provider SDK, and streams the response back as SSE. No server-side database or sessions.

This keeps the architecture simple for a personal-use tool while leaving the door open for a future migration to server-side persistence (SQLite) if needed.

## Feature 1: Scroll-to-Bottom Button

### Behavior

- The chat `<main>` element tracks scroll position via an `onScroll` handler.
- A boolean state `showScrollButton` is `true` when `scrollTop + clientHeight < scrollHeight - 100` (user is more than ~100px from the bottom).
- When `showScrollButton` is true, a floating circular down-arrow button renders absolutely positioned in the bottom-right of the chat area, above the recorder footer.
- Clicking the button calls `el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })`.
- **Auto-scroll is paused** when the user has scrolled up (`showScrollButton` is true). New streaming tokens no longer yank the viewport down while the user is reading earlier messages.
- Auto-scroll resumes automatically when the user returns to the bottom (scrolls down or taps the button).

### UI

- 36px circular button, `background: var(--bg-surface)`, `border: 1px solid #334155`, `color: var(--accent)`.
- Down-arrow icon (CSS or Unicode `↓`).
- Subtle box-shadow for elevation. Fade-in/out transition.

## Feature 2: Model & API Key Configuration

### Supported Providers and Models

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, o1, o1-mini |
| Anthropic | claude-sonnet-4-20250514, claude-haiku-4-20250506 |
| Google | gemini-2.0-flash, gemini-2.5-pro |

Model options are **hardcoded in the frontend** as a static map of `{ provider: modelId[] }`. Updated via code changes when new models release.

### UI (Sidebar Settings Section)

Located at the bottom of the sidebar, below chat history:

- **Provider selector** — dropdown or segmented control: OpenAI / Anthropic / Google.
- **Model dropdown** — options update dynamically based on the selected provider.
- **API Key input** — password-type input per provider. Shows masked value (e.g., `sk-...7f2x`) with a checkmark when set. Each provider has its own stored key so switching providers doesn't lose keys.

### Storage

```ts
// localStorage key: "interview-helper-settings"
interface Settings {
  provider: "openai" | "anthropic" | "google";
  model: string;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
}
```

- Settings persist across sessions in `localStorage`.
- The API key for the active provider is sent in each request body to the server.
- The server never stores keys — they are used for a single API call and discarded.
- A small disclaimer in the UI: "Your API key is stored locally in your browser."

### Default Behavior

- If no API key is sent in the request, the server falls back to provider-specific env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY` from `.env`.
- If neither a request key nor an env var is available for the active provider, the server returns a 400 error and the UI shows an inline error prompting the user to enter a key.

### Transport Security

API keys are sent in the request body over the network. In local development (`localhost`), this is not a concern. For any non-local deployment, HTTPS is required. This is an accepted constraint for a personal-use tool.

## Feature 3: Chat History

### Storage

```ts
// localStorage key: "interview-helper-chats"
interface StoredChat {
  id: string;           // crypto.randomUUID()
  title: string;        // First user message, truncated to ~50 chars
  messages: ChatMessage[];
  createdAt: number;    // Unix timestamp (ms)
  updatedAt: number;    // Unix timestamp (ms)
}
// Stored as JSON array, sorted by updatedAt descending, max 10 items.
```

### Behavior

- A new chat is created and saved when the user sends their first message (not when they click "New Chat").
- The title is auto-generated from the first user message (first ~50 characters, truncated at word boundary).
- Every message pair (user question + assistant response) triggers a save to `localStorage`.
- When the chat count exceeds 10, the chat with the **smallest (earliest) `updatedAt`** value is dropped — i.e., the least recently active chat is evicted. This means revisiting an old chat keeps it alive, which is intentional.
- Switching chats in the sidebar loads that chat's messages into React state.

### UI (Sidebar Chat List)

- Scrollable list in the sidebar, below the "New Chat" button.
- Each item shows the chat title (single line, ellipsis overflow).
- Active chat is highlighted with a left accent border and surface background.
- Inactive chats show in muted text.
- Section label: "Recent Chats" in small uppercase.

## Feature 4: New Chat

- A prominent accent-colored button at the top of the sidebar: `+ New Chat`.
- Clicking it:
  1. Saves the current chat (if it has messages) to localStorage.
  2. Clears `messages`, `streamingAnswer`, `error` from React state.
  3. No new chat entry is created in storage yet — that happens on first message.
- On mobile, the sidebar closes after clicking "New Chat".

## Layout Changes

### Sidebar (New Component)

- **Desktop (≥768px):** Fixed 260px sidebar on the left, always visible. Main chat area fills remaining width.
- **Mobile (<768px):** Sidebar is hidden. A hamburger icon (☰) in the header toggles it as a full-width overlay with a semi-transparent backdrop. A close button (✕) in the top-right of the sidebar, tapping the backdrop, or selecting a chat all close the sidebar.

### Sidebar Structure (Top to Bottom)

1. `+ New Chat` button (accent color, full width)
2. "Recent Chats" section label
3. Scrollable chat list (flex: 1, overflow-y: auto)
4. Divider line
5. "Settings" section label
6. Provider selector
7. Model dropdown
8. API Key input + status

### Header Changes

- Add hamburger menu icon (☰) on the left side of the header, visible only on mobile (<768px).
- Title remains "Interview Helper".

### Main Chat Area

- No longer has a max-width of 600px when sidebar is present on desktop — it fills the remaining space (but message bubbles can retain a max-width for readability).
- The scroll-to-bottom button is positioned inside this area. The scroll state (`showScrollButton`) and the button itself are owned by `App.tsx` (which owns the `<main>` ref), not by `AnswerDisplay`.

## Server Changes

### Request Payload

```ts
// POST /api/answer
interface AnswerRequest {
  messages: ChatMessage[];
  provider: "openai" | "anthropic" | "google";
  model: string;
  apiKey?: string;  // Optional — falls back to server .env key
}
```

### Provider Routing

The endpoint handler:

1. Validates the request (existing validation + new fields).
2. Selects a provider adapter based on `provider`.
3. The adapter instantiates the appropriate SDK client with the provided `apiKey` (or falls back to the provider-specific env var: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`).
4. Streams the response back as SSE using the existing `data: "token"\n\n` / `data: [DONE]\n\n` format.

### Provider Adapters

Each adapter implements the same interface:

```ts
interface ProviderAdapter {
  stream(params: {
    model: string;
    apiKey: string;
    messages: ChatMessage[];
    systemPrompt: string;
    maxTokens: number;   // 512 for all providers (same as V1)
    temperature: number; // 0.4 for all providers (same as V1)
  }): AsyncIterable<string>; // yields token strings
}
```

All providers use the same `maxTokens: 512` and `temperature: 0.4` values established in V1. These keep responses concise for quick glancing during interviews.

- **OpenAI adapter:** Refactored from existing code. Uses `openai` SDK.
- **Anthropic adapter:** Uses `@anthropic-ai/sdk`. Maps `ChatMessage[]` to Anthropic's message format (system prompt goes in a separate parameter). Streams via `messages.stream()`.
- **Google adapter:** Uses `@google/generative-ai`. Maps messages to Google's content format. Streams via `generateContentStream()`.

### New Dependencies

- `@anthropic-ai/sdk` — Anthropic API client
- `@google/generative-ai` — Google Generative AI client (verify latest package name at implementation time; Google may have migrated to `@google/genai`)

### Removed

- **Optional bearer token auth (`API_SECRET`)** — replaced by per-request API keys. The `API_SECRET` env var and its middleware are removed.

### What Stays the Same

- Rate limiting (10 req/min per IP)
- CORS configuration
- Body size limit (50KB)
- Input validation (non-empty messages, last message is user, max length)
- Concurrency throttle (2 per IP)
- SSE response format
- System prompt (interview helper persona)
- Abort on client disconnect
- Graceful shutdown

## New Component Structure

```
src/
├── App.tsx                    # Updated: sidebar state, chat management, scroll tracking
├── api/
│   └── getAnswer.ts           # Updated: signature becomes streamAnswer({ messages, provider, model, apiKey }, onToken, signal)
├── components/
│   ├── Sidebar.tsx            # NEW: chat list, new chat button, settings
│   ├── Settings.tsx           # NEW: provider/model/apiKey controls
│   ├── Recorder.tsx           # Unchanged
│   └── AnswerDisplay.tsx      # Unchanged (scroll button owned by App.tsx)
├── hooks/
│   ├── useChats.ts            # NEW: localStorage CRUD for chats
│   └── useSettings.ts         # NEW: localStorage CRUD for settings
├── types.ts                   # NEW: shared type definitions
└── config.ts                  # NEW: provider/model map
```

```
server/
├── index.ts                   # Updated: parse new fields, route to adapter
├── adapters/
│   ├── openai.ts              # NEW: extracted from index.ts
│   ├── anthropic.ts           # NEW: Anthropic streaming
│   └── google.ts              # NEW: Google streaming
└── types.ts                   # NEW: shared server types
```

## Edge Cases

- **localStorage cleared / incognito mode:** All chats and keys are lost. The app gracefully falls back to defaults (empty chat list, no API key configured, OpenAI + gpt-4o-mini selected). No error state — just a fresh start.
- **`crypto.randomUUID()` availability:** Requires a secure context (HTTPS or localhost). This is satisfied for the expected deployment scenarios.

## Out of Scope

- User authentication / multi-user support
- Server-side chat persistence (future V3 / Approach B)
- Editable chat titles (auto-generated only)
- Chat search / filtering
- Export / import of chat history
- Custom system prompts per chat
