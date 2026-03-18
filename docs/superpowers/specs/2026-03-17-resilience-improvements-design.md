# Interview Helper — Resilience & UX Improvements Design

**Date:** 2026-03-17
**Status:** Approved

## Problem Statement

The interview helper app is used on a phone propped against a laptop screen during live video call interviews. The interviewee uses AI-generated bullet points to paraphrase answers. Several reliability and UX gaps threaten the experience:

1. **Slow time-to-first-token** — dead silence while waiting for the first AI token is suspicious
2. **Server disconnect / phone crash** — losing chat history and having no way to retry the current question mid-interview is catastrophic
3. **Server overload / token cost** — single server with no cost visibility; runaway token usage is possible
4. **Answer format** — current prose responses are hard to scan quickly; text is too small

## Constraints

- Phone propped against laptop screen during video call
- User paraphrases from bullet points (does not read verbatim)
- Must be foolproof — failures during a live interview are unrecoverable
- Single server deployment (Render), multi-user is a future concern
- No architectural overhaul — targeted improvements to existing flow

## Out of Scope (Revisit Later)

- **Silent mic mode (continuous recognition)** — eliminates iOS beep by never stopping recognition, but edge cases around browser killing recognition silently are too risky without thorough iOS testing
- **Teleprompter display** — repositioning answers to top of screen for eye-line optimization
- **Multi-user scaling** — autoscaling, load balancing, queue systems

---

## Design

### 1. Stall Phrases

**Goal:** Eliminate dead silence between tapping "Send" and receiving the first AI token.

**Behavior:**
- The moment the user taps "Send," before any server response, the app instantly displays a contextual filler phrase the user can say aloud to buy time
- Phrases are selected from a local bank categorized by question type:
  - **Technical** (keywords: "implement," "design," "build," "algorithm," "system"): e.g., "That's a good question — let me walk through my thinking on that..."
  - **Behavioral** (keywords: "tell me about a time," "describe a situation," "example of"): e.g., "Sure, let me think of a good example..."
  - **General** (fallback): e.g., "Great question, let me gather my thoughts..."
- Selection uses naive keyword matching on the user's transcript
- Multiple phrases per category — rotate to avoid sounding repetitive
- Display: italicized, lighter color, visually distinct from the real answer
- Stall phrase is shown for a **minimum of 1.5 seconds** to prevent a jarring flash if the server responds quickly
- Once the minimum time has passed AND the first real token has arrived, the stall phrase fades out
- Stall phrase and streaming answer are both visible briefly during the crossfade

**Implementation location:** Entirely client-side in App.tsx. No server involvement. A new utility file for the phrase bank and category matching logic.

**No changes to:** Server, API, Recorder component.

---

### 2. Answer Display Tweaks

**Goal:** Make answers easy to scan at a glance during an interview.

**Changes:**

1. **Larger text:** The current answer text uses `clamp(1.1rem, 4vw, 1.6rem)`, which ranges from ~17.6px to ~25.6px. Increase the minimum from `1.1rem` to `1.25rem` so the text stays at least 20px even on narrow screens, improving readability at arm's length.
2. **Bullet-point system prompt:** Update the server-side system prompt to instruct the AI to always return 3-5 concise bullet points. Each bullet should be a short phrase suitable for paraphrasing, not a full sentence or paragraph.
3. **Max tokens:** Increase `maxTokens` from 512 to **768**. This gives the model room for complex technical questions while the system prompt constraint keeps typical answers concise. Also helps with token budget since the model is encouraged to be brief.

**System prompt changes:**
- Remove the existing "Use plain language, no markdown" directive (it conflicts with bullet-point formatting)
- Add the following instruction:
```
Format your response as 3-5 concise bullet points using "- " prefix.
Each bullet should be a short phrase or single sentence — not a paragraph.
The user will paraphrase these, so keep them scannable.
No other markdown formatting (no headers, bold, code blocks, etc.).
```
- The client already renders markdown in AnswerDisplay, so `- ` bullets will render as a list naturally.

**Implementation location:** System prompt change in `server/index.ts`. Text size change in `src/components/AnswerDisplay.tsx` (inline styles). `maxTokens` constant in server config.

---

### 3. Crash-Proof State & Retry

**Goal:** Never lose interview context, and always be able to retry the current question.

#### 3a. In-Flight Persistence

During streaming, persist the following to localStorage under key `interview-helper-inflight` every **500ms** (debounced):

```typescript
{
  chatId: string,
  messages: ChatMessage[],       // full history up to current question
  currentQuestion: string,       // the user message that was sent
  partialAnswer: string,         // accumulated tokens so far
  jobDescription: string,        // active JD context
  // resume is NOT included — it already persists independently via useResume hook
  provider: string,
  model: string,
  timestamp: number              // for staleness detection
}
```

- Writing on every token would be expensive; 500ms debounce means worst case we lose ~0.5s of tokens, which is acceptable since retry regenerates the full answer
- Clear this key when streaming completes successfully (`[DONE]` received)
- Also clear on explicit "New Chat" action

#### 3b. Recovery on Reload

On app load, check for `interview-helper-inflight`:

- The `timestamp` is updated on every debounced write (every 500ms during streaming), so the 30-minute window is relative to the last write, not the session start
- Parse the stored JSON in a try/catch — if corrupted (e.g., crash during write), discard silently and continue as a fresh session
- If present, valid, and `timestamp` is within the last 30 minutes:
  - Restore full message history to the chat
  - Show partial answer (if any) with a banner: **"Answer was interrupted"**
  - Show a prominent **"Retry" button**
  - Restore job description to active chat context
- If older than 30 minutes: discard (stale data from a previous interview)

#### 3c. Retry Button

- Appears on:
  - Crash recovery (as above)
  - Any failed request (network error, server error, timeout)
  - Interrupted streaming (disconnect detected)
- One tap re-sends the same question with full message history, JD, and resume context (resume loaded from its own localStorage key via `useResume`)
- Uses the same AbortController pattern — user can still cancel a retry
- **Manual only** — no auto-retry. Every retry is a conscious user action to prevent token burn.
- After successful retry, in-flight key is cleared normally

#### 3d. Job Description in Chat Persistence

- Include `jobDescription` in the `saveChat()` call so it persists with the chat in `interview-helper-chats`
- On `loadChat()`, restore the JD to the active context
- This ensures switching between chats (e.g., different interviews) preserves the correct JD

**Implementation location:** New persistence logic in App.tsx (in-flight writes during streaming). Recovery check in App.tsx `useEffect` on mount. Retry button in AnswerDisplay or a new small component. `useChats` hook updated to include JD.

---

### 4. Token Budget Indicator

**Goal:** Give the user cost awareness without blocking them.

#### 4a. Client-Side Cost Estimation

- Maintain a pricing table in `src/config.ts` for each supported model:
  ```typescript
  MODEL_PRICING: {
    "gpt-4o": { input: 0.0025, output: 0.01 },       // per 1K tokens
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "o1": { input: 0.015, output: 0.06 },
    "o1-mini": { input: 0.003, output: 0.012 },
    "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
    "claude-haiku-4-20250506": { input: 0.0008, output: 0.004 },
    "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
    "gemini-2.5-pro": { input: 0.00125, output: 0.01 },
  }
  ```
- Estimate tokens from character count: `tokens ≈ chars / 4` (note: this heuristic can be off by 2-3x for code-heavy responses common in technical interviews, but is sufficient for a cost awareness indicator)
- If a model is not in the pricing table (e.g., newly added models), show "$?" instead of a dollar amount
- On each request: estimate input tokens (messages + context) × input price
- On each response: estimate output tokens × output price
- Accumulate per-session total

#### 4b. Display

- Subtle cost indicator in the main UI (e.g., corner of the screen): `"$0.12"`
- **Green** when under $0.50
- **Red** when at or above $0.50
- **No blocking** — the user can always keep going; this is purely informational
- Live-updates as tokens stream in (recalculated based on current model's pricing)

#### 4c. Reset

- Resets when user starts a new chat session
- Can be manually reset from settings

#### 4d. Server-Side Hard Cap (Safety Net)

- Track cumulative estimated tokens per IP per hour in an in-memory `Map` (similar to existing `inFlight` map)
- Token counting on server: estimate using `chars / 4` on both the request body (messages + context) and the streamed response characters. Matches the client-side heuristic.
- Hard cap: **100,000 tokens per IP per hour**
- Return 429 with message: "Hourly token limit exceeded — please wait before sending more requests"
- This prevents runaway costs from bugs, retry loops, or abuse
- Separate from existing rate limit (10 req/min), which stays as-is

**Implementation location:** Pricing table in `src/config.ts`. Cost tracking state in App.tsx or a new `useBudget` hook. Display component in main view. Server-side token tracking in `server/index.ts`.

---

### 5. Connection Health & Recovery

**Goal:** The user should always know if the server is reachable, and never be left wondering if something is broken.

#### 5a. Health Endpoint

- New endpoint: `GET /api/health` — returns `{ "status": "ok" }`, no auth required
- Lightweight, no database or AI calls
- **Must be registered before the rate limiter middleware** so health pings don't count toward the 10 req/min limit

#### 5b. Health Indicator

- Small dot in the main UI (near the cost indicator):
  - **Green:** server reachable
  - **Red:** server unreachable
- On app load: ping `/api/health`
- Every **30 seconds:** ping again
- If ping fails: dot turns red (no toast/alert — just the visual)
- If ping succeeds after failure: dot turns green

#### 5c. Streaming Disconnect Detection

- During active streaming, if no token is received for **10 seconds** and `[DONE]` has not been received:
  - Treat as a disconnect
  - Stop the stream reader
  - Show banner: **"Connection lost — answer incomplete"**
  - Show the retry button (Section 3c)
  - The in-flight persistence (Section 3a) ensures the partial answer and context are already saved

#### 5d. No Aggressive Reconnection

- Health pings are passive indicators only
- No automatic request retries on disconnect
- User decides when to retry via the retry button

**Implementation location:** `/api/health` endpoint in `server/index.ts`. Health ping logic and indicator in App.tsx or a new `useHealth` hook. Streaming timeout detection in `getAnswer.ts`.

---

## Data Flow Summary

```
User taps Send
  → Stall phrase shown instantly (client-side)
  → Request sent to /api/answer
  → In-flight state written to localStorage (debounced 500ms)
  → Tokens stream via SSE
    → Each token: update answer display, update cost estimate, update in-flight state
    → If 10s silence: disconnect detected → banner + retry button
  → [DONE] received
    → Stall phrase fades out (already gone by now)
    → In-flight state cleared
    → Chat saved (with JD) to localStorage
    → Cost indicator updated

If app crashes/reloads mid-stream:
  → In-flight state detected on load
  → Chat history + partial answer restored
  → "Answer interrupted" banner + retry button shown
  → User taps retry → same question re-sent with full context
```

## Files Affected

| Area | Files |
|------|-------|
| Stall phrases | New: `src/utils/stallPhrases.ts`. Modified: `src/App.tsx`, `src/components/AnswerDisplay.tsx` |
| Answer display | `server/index.ts` (system prompt, maxTokens), `src/components/AnswerDisplay.tsx` (inline styles) |
| Crash-proof state | `src/App.tsx` (in-flight persistence, recovery), `src/hooks/useChats.ts` (JD in chat), `src/types.ts` (InFlightState interface) |
| Token budget | New: `src/hooks/useBudget.ts`. Modified: `src/config.ts` (pricing), `src/App.tsx`, `server/index.ts` (server cap) |
| Connection health | New: `src/hooks/useHealth.ts`. Modified: `server/index.ts` (/api/health, before rate limiter), `src/api/getAnswer.ts` (timeout detection), `src/App.tsx` |
