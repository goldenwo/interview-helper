# Resilience & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the interview helper app resilient to crashes, disconnects, and slow responses while improving answer readability for phone use during live video interviews.

**Architecture:** Five independent features layered onto the existing React + Express SSE architecture. Each feature is self-contained: stall phrases (client-only), answer display tweaks (server prompt + client CSS), crash-proof state (client persistence + retry UI), token budget (client hook + server cap), and connection health (client hook + server endpoint). No new dependencies required.

**Tech Stack:** React 19, TypeScript, Vite, Express 5, localStorage, SSE streaming

**Spec:** `docs/superpowers/specs/2026-03-17-resilience-improvements-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/stallPhrases.ts` | Create | Phrase bank, category matching, rotation logic |
| `src/types.ts` | Modify | Add `InFlightState` interface |
| `src/config.ts` | Modify | Add `MODEL_PRICING` table |
| `src/hooks/useBudget.ts` | Create | Per-session cost estimation, accumulation, reset |
| `src/hooks/useHealth.ts` | Create | Health ping polling, connection state |
| `src/api/getAnswer.ts` | Modify | Add 10s streaming timeout detection |
| `src/components/AnswerDisplay.tsx` | Modify | Larger text, stall phrase display, retry button, cost/health indicators |
| `src/App.tsx` | Modify | Wire stall phrases, in-flight persistence, recovery, budget, health, retry |
| `server/index.ts` | Modify | System prompt, maxTokens, /api/health endpoint, token cap middleware |

**Note on Spec Section 3d (JD in Chat Persistence):** Already implemented — `saveChat()` already accepts `jobDescription`, and `loadChat()` already returns it. No changes needed.

---

### Task 1: Stall Phrases Utility

**Files:**
- Create: `src/utils/stallPhrases.ts`

- [ ] **Step 1: Create the stall phrases utility file**

```typescript
// src/utils/stallPhrases.ts

type Category = "technical" | "behavioral" | "general";

const PHRASES: Record<Category, string[]> = {
  technical: [
    "That's a good question — let me walk through my thinking on that...",
    "Sure, let me break down how I'd approach that...",
    "Great question — let me think through the key considerations...",
  ],
  behavioral: [
    "Sure, let me think of a good example...",
    "That's a great question — I have a relevant experience in mind...",
    "Let me think about the best example for that...",
  ],
  general: [
    "Great question, let me gather my thoughts...",
    "That's an interesting question — give me a moment to think...",
    "Sure, let me think about that for a second...",
  ],
};

const TECHNICAL_KEYWORDS = [
  "implement", "design", "build", "algorithm", "system",
  "architect", "scale", "database", "api", "code",
  "function", "class", "data structure", "complexity",
  "optimize", "debug", "deploy", "infrastructure",
];

const BEHAVIORAL_KEYWORDS = [
  "tell me about a time", "describe a situation", "example of",
  "give me an example", "how did you handle", "what would you do",
  "conflict", "challenge", "difficult", "leadership",
  "teamwork", "mistake", "failure", "proud",
];

const lastUsed: Record<Category, number> = {
  technical: -1,
  behavioral: -1,
  general: -1,
};

function categorize(question: string): Category {
  const lower = question.toLowerCase();
  if (BEHAVIORAL_KEYWORDS.some((kw) => lower.includes(kw))) return "behavioral";
  if (TECHNICAL_KEYWORDS.some((kw) => lower.includes(kw))) return "technical";
  return "general";
}

export function getStallPhrase(question: string): string {
  const category = categorize(question);
  const phrases = PHRASES[category];
  // Rotate: pick next phrase, wrapping around
  let index = (lastUsed[category] + 1) % phrases.length;
  lastUsed[category] = index;
  return phrases[index];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors related to `stallPhrases.ts`

- [ ] **Step 3: Commit**

```bash
git add src/utils/stallPhrases.ts
git commit -m "feat: add stall phrases utility with category matching and rotation"
```

---

### Task 2: Answer Display Tweaks (Text Size + System Prompt + Max Tokens)

**Files:**
- Modify: `src/components/AnswerDisplay.tsx:94` (text size)
- Modify: `server/index.ts:71-78` (system prompt)
- Modify: `server/index.ts:216` (maxTokens)

- [ ] **Step 1: Increase minimum text size in AnswerDisplay**

In `src/components/AnswerDisplay.tsx`, change line 94:

```typescript
// OLD
fontSize: "clamp(1.1rem, 4vw, 1.6rem)",

// NEW
fontSize: "clamp(1.25rem, 4vw, 1.6rem)",
```

- [ ] **Step 2: Update the system prompt in server/index.ts**

Replace the `SYSTEM_PROMPT` constant (lines 71-78) with:

```typescript
const SYSTEM_PROMPT = `You are the user's voice in a live interview. The user will relay what the interviewer says. Respond with exactly what the user should say back — written in first person as if the user is speaking directly to the interviewer. Do NOT explain things to the user or teach them. Just give them the words to say.

For coding challenges: "Here's my approach..." then the solution and a brief walkthrough as you'd narrate it to an interviewer.
For behavioral questions: answer in first person using STAR format — "In my previous role, I..."
For technical questions: answer confidently in first person — "The way I think about this is..."
For follow-ups: continue naturally in first person, in context of the conversation.

Format your response as 3-5 concise bullet points using "- " prefix. Each bullet should be a short phrase or single sentence — not a paragraph. The user will paraphrase these, so keep them scannable. No other markdown formatting (no headers, bold, code blocks, etc.).

Keep answers concise enough to glance at on a phone.`;
```

- [ ] **Step 3: Increase maxTokens from 512 to 768**

In `server/index.ts`, change line 216:

```typescript
// OLD
maxTokens: 512,

// NEW
maxTokens: 768,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/AnswerDisplay.tsx server/index.ts
git commit -m "feat: increase answer text size, add bullet-point system prompt, bump maxTokens to 768"
```

---

### Task 3: InFlightState Type + Model Pricing Config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add InFlightState interface to types.ts**

Add at the end of `src/types.ts`:

```typescript
export interface InFlightState {
  chatId: string;
  messages: ChatMessage[];
  currentQuestion: string;
  partialAnswer: string;
  jobDescription: string;
  provider: string;
  model: string;
  timestamp: number;
}
```

- [ ] **Step 2: Add MODEL_PRICING to config.ts**

Add at the end of `src/config.ts`:

```typescript
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "o1": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 0.003, output: 0.012 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-haiku-4-20250506": { input: 0.0008, output: 0.004 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-2.5-pro": { input: 0.00125, output: 0.01 },
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add InFlightState type and MODEL_PRICING config"
```

---

### Task 4: Token Budget Hook

**Files:**
- Create: `src/hooks/useBudget.ts`

- [ ] **Step 1: Create the useBudget hook**

```typescript
// src/hooks/useBudget.ts
import { useState, useCallback, useRef } from "react";
import { MODEL_PRICING } from "../config";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function useBudget() {
  const [cost, setCost] = useState(0);
  const costRef = useRef(0);

  const addInputCost = useCallback((text: string, model: string) => {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return;
    const tokens = estimateTokens(text);
    const delta = (tokens / 1000) * pricing.input;
    costRef.current += delta;
    setCost(costRef.current);
  }, []);

  const addOutputCost = useCallback((text: string, model: string) => {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return;
    const tokens = estimateTokens(text);
    const delta = (tokens / 1000) * pricing.output;
    costRef.current += delta;
    setCost(costRef.current);
  }, []);

  const resetBudget = useCallback(() => {
    costRef.current = 0;
    setCost(0);
  }, []);

  const hasPricing = useCallback((model: string): boolean => {
    return model in MODEL_PRICING;
  }, []);

  return { cost, addInputCost, addOutputCost, resetBudget, hasPricing };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBudget.ts
git commit -m "feat: add useBudget hook for per-session cost estimation"
```

---

### Task 5: Health Check Hook

**Files:**
- Create: `src/hooks/useHealth.ts`

- [ ] **Step 1: Create the useHealth hook**

```typescript
// src/hooks/useHealth.ts
import { useState, useEffect, useRef } from "react";

const PING_INTERVAL = 30_000; // 30 seconds

export function useHealth() {
  const [healthy, setHealthy] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch("/api/health", { method: "GET" });
        setHealthy(res.ok);
      } catch {
        setHealthy(false);
      }
    };

    // Initial ping
    ping();

    // Poll every 30s
    intervalRef.current = setInterval(ping, PING_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { healthy };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useHealth.ts
git commit -m "feat: add useHealth hook for server health polling"
```

---

### Task 6: Health Endpoint + Token Cap on Server

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add /api/health endpoint BEFORE rate limiter**

In `server/index.ts`, add the health endpoint immediately after the `app.use(express.json(...))` line (line 26), BEFORE the rate limiter on line 28:

```typescript
// Health check — registered before rate limiter so pings don't count
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

- [ ] **Step 2: Add token usage tracking middleware**

After the existing concurrency throttle block (after line 55), add:

```typescript
// Per-IP hourly token budget (estimated)
const tokenUsage = new Map<string, { tokens: number; resetAt: number }>();
const MAX_TOKENS_PER_HOUR = 100_000;

function getTokenUsage(ip: string): { tokens: number; resetAt: number } {
  const now = Date.now();
  const entry = tokenUsage.get(ip);
  if (!entry || now >= entry.resetAt) {
    const fresh = { tokens: 0, resetAt: now + 3_600_000 };
    tokenUsage.set(ip, fresh);
    return fresh;
  }
  return entry;
}

function addTokens(ip: string, count: number) {
  const entry = getTokenUsage(ip);
  entry.tokens += count;
}
```

- [ ] **Step 3: Add token budget check to /api/answer route**

In the `/api/answer` handler, after the API key validation block (find `res.status(400).json({ error: \`No API key...`) and before `const adapter = adapters[resolvedProvider]`, add:

```typescript
  // Check hourly token budget
  const ip = req.ip ?? "unknown";
  const usage = getTokenUsage(ip);
  if (usage.tokens >= MAX_TOKENS_PER_HOUR) {
    res.status(429).json({ error: "Hourly token limit exceeded — please wait before sending more requests" });
    return;
  }
```

- [ ] **Step 4: Track token usage during streaming**

In the `/api/answer` handler, estimate input tokens before streaming starts (after `const trimmed = messages.slice(...)` line, before the `try` block):

```typescript
  // Estimate input tokens for budget tracking
  const inputChars = trimmed.reduce((sum, m) => sum + m.content.length, 0)
    + (resume?.length ?? 0)
    + (jobDescription?.length ?? 0);
  addTokens(ip, Math.ceil(inputChars / 4));
```

Then inside the streaming `for await` loop, track output tokens. Change the loop from:

```typescript
    for await (const token of tokenStream) {
      if (abortController.signal.aborted) break;
      res.write(`data: ${JSON.stringify(token)}\n\n`);
    }
```

to:

```typescript
    let outputChars = 0;
    for await (const token of tokenStream) {
      if (abortController.signal.aborted) break;
      outputChars += token.length;
      res.write(`data: ${JSON.stringify(token)}\n\n`);
    }
    addTokens(ip, Math.ceil(outputChars / 4));
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/health endpoint and per-IP hourly token cap"
```

---

### Task 7: Streaming Timeout Detection

**Files:**
- Modify: `src/api/getAnswer.ts:81-106`

- [ ] **Step 1: Add 10-second streaming timeout to getAnswer.ts**

Replace the streaming read loop in `streamAnswer` (lines 81-106) with a version that detects 10s silence:

```typescript
  const STREAM_TIMEOUT_MS = 10_000;

  while (true) {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>(
      (_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Connection lost — answer incomplete")),
          STREAM_TIMEOUT_MS
        );
        signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
      }
    );

    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([
        reader.read(),
        timeoutPromise,
      ]);
    } catch (e) {
      // Timeout fired — treat as disconnect
      reader.cancel().catch(() => {});
      throw e;
    }
    // Clear the timeout since reader.read() won the race
    clearTimeout(timer!);

    const { done, value } = result;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "string") {
          onToken(parsed);
        } else if (parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
          throw e;
        }
      }
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/getAnswer.ts
git commit -m "feat: add 10s streaming timeout detection for disconnect recovery"
```

---

### Task 8: Update AnswerDisplay + Wire Everything in App.tsx

**Files:**
- Modify: `src/components/AnswerDisplay.tsx`
- Modify: `src/App.tsx`

**Note:** Tasks 8 and 9 are combined into one task because AnswerDisplay's new props require App.tsx to pass them. Both files must be updated atomically for the build to pass.

- [ ] **Step 1: Add stall phrase, retry button, and status indicators to AnswerDisplay**

Update the Props interface and component in `src/components/AnswerDisplay.tsx`:

```typescript
import type { ChatMessage } from "../types";

interface Props {
  messages: ChatMessage[];
  streamingAnswer: string;
  loading: boolean;
  error: string;
  stallPhrase: string;
  showRetry: boolean;
  onRetry: () => void;
  interruptedAnswer: string;
  cost: number;
  hasPricing: boolean;
  healthy: boolean;
}

export default function AnswerDisplay({
  messages,
  streamingAnswer,
  loading,
  error,
  stallPhrase,
  showRetry,
  onRetry,
  interruptedAnswer,
  cost,
  hasPricing,
  healthy,
}: Props) {
  if (messages.length === 0 && !loading && !stallPhrase) {
    return (
      <div style={styles.center}>
        <p style={styles.placeholder}>Your answer will appear here</p>
        <div style={styles.statusBar}>
          <span style={{ ...styles.healthDot, background: healthy ? "#22c55e" : "#ef4444" }} />
          <span style={styles.costText}>
            {hasPricing
              ? <span style={{ color: cost >= 0.5 ? "#ef4444" : "#22c55e" }}>${cost.toFixed(2)}</span>
              : "$?"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.chatLog}>
      <div style={styles.statusBar}>
        <span style={{ ...styles.healthDot, background: healthy ? "#22c55e" : "#ef4444" }} />
        <span style={styles.costText}>
          {hasPricing
            ? <span style={{ color: cost >= 0.5 ? "#ef4444" : "#22c55e" }}>${cost.toFixed(2)}</span>
            : "$?"}
        </span>
      </div>

      {messages.map((msg, i) => (
        <div key={i} style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
          <p style={msg.role === "user" ? styles.userText : styles.answerText}>
            {msg.content}
          </p>
        </div>
      ))}

      {stallPhrase && !streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.stallText}>{stallPhrase}</p>
        </div>
      )}

      {interruptedAnswer && !streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.answerText}>{interruptedAnswer}</p>
          <div style={styles.interruptedBanner}>Answer was interrupted</div>
        </div>
      )}

      {streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.answerText}>{streamingAnswer}</p>
        </div>
      )}

      {loading && !stallPhrase && (
        <div style={styles.assistantBubble}>
          <div style={styles.pulse}>Thinking…</div>
        </div>
      )}

      {error && (
        <div style={styles.assistantBubble}>
          <p style={{ ...styles.answerText, color: "var(--danger)", fontSize: "1rem" }}>
            {error}
          </p>
        </div>
      )}

      {showRetry && (
        <button onClick={onRetry} style={styles.retryButton}>
          Retry
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    textAlign: "center",
    padding: 16,
    flexDirection: "column",
    gap: 16,
  },
  placeholder: {
    color: "var(--text-muted)",
    fontSize: "1.1rem",
  },
  chatLog: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "8px 0",
    width: "100%",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-end",
    padding: "0 4px",
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
  costText: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-muted)",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "var(--accent)",
    color: "var(--bg)",
    borderRadius: "16px 16px 4px 16px",
    padding: "8px 14px",
    maxWidth: "85%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "var(--bg-surface)",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 14px",
    maxWidth: "100%",
    width: "100%",
  },
  userText: {
    fontSize: "0.9rem",
    lineHeight: 1.4,
  },
  answerText: {
    fontSize: "clamp(1.25rem, 4vw, 1.6rem)",
    lineHeight: 1.5,
    fontWeight: 500,
    whiteSpace: "pre-wrap" as const,
  },
  stallText: {
    fontSize: "clamp(1.1rem, 3.5vw, 1.4rem)",
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-muted)",
    whiteSpace: "pre-wrap" as const,
  },
  interruptedBanner: {
    marginTop: 8,
    padding: "4px 10px",
    background: "#78350f",
    color: "#fbbf24",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontWeight: 500,
    display: "inline-block",
  },
  retryButton: {
    alignSelf: "center",
    padding: "10px 32px",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  pulse: {
    fontSize: "1.2rem",
    color: "var(--accent)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
};
```

- [ ] **Step 2: Add imports and hooks to App.tsx**

At the top of `src/App.tsx`, update imports:

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import Recorder from "./components/Recorder";
import AnswerDisplay from "./components/AnswerDisplay";
import Sidebar from "./components/Sidebar";
import { streamAnswer } from "./api/getAnswer";
import { useSettings } from "./hooks/useSettings";
import { useChats } from "./hooks/useChats";
import { useResume } from "./hooks/useResume";
import { useBudget } from "./hooks/useBudget";
import { useHealth } from "./hooks/useHealth";
import { getStallPhrase } from "./utils/stallPhrases";
import type { ChatMessage, InFlightState } from "./types";
```

- [ ] **Step 3: Add new state and hooks inside App component**

After the existing state declarations (after line 21), add:

```typescript
  const [stallPhrase, setStallPhrase] = useState("");
  const [showRetry, setShowRetry] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [interruptedAnswer, setInterruptedAnswer] = useState("");
  const { cost, addInputCost, addOutputCost, resetBudget, hasPricing } = useBudget();
  const { healthy } = useHealth();
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallMinElapsedRef = useRef(false);
  const firstTokenReceivedRef = useRef(false);
  const inflightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partialAnswerRef = useRef("");
```

- [ ] **Step 4: Add in-flight persistence helpers**

Add these functions inside the App component, after the hook declarations:

```typescript
  const INFLIGHT_KEY = "interview-helper-inflight";
  const INFLIGHT_MAX_AGE = 30 * 60 * 1000; // 30 minutes

  const saveInflight = useCallback(() => {
    const state: InFlightState = {
      chatId: activeChatIdRef.current ?? crypto.randomUUID(),
      messages: messagesRef.current,
      currentQuestion: lastQuestion,
      partialAnswer: partialAnswerRef.current,
      jobDescription,
      provider: settings.provider,
      model: settings.model,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(INFLIGHT_KEY, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — non-fatal
    }
  }, [lastQuestion, jobDescription, settings.provider, settings.model]);

  const clearInflight = useCallback(() => {
    localStorage.removeItem(INFLIGHT_KEY);
  }, []);

  const startInflightPersistence = useCallback(() => {
    if (inflightTimerRef.current) clearInterval(inflightTimerRef.current);
    inflightTimerRef.current = setInterval(saveInflight, 500);
  }, [saveInflight]);

  const stopInflightPersistence = useCallback(() => {
    if (inflightTimerRef.current) {
      clearInterval(inflightTimerRef.current);
      inflightTimerRef.current = null;
    }
  }, []);
```

- [ ] **Step 5: Add recovery logic on mount**

Add a `useEffect` for crash recovery, after the existing effects:

```typescript
  // Recover from crash/reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INFLIGHT_KEY);
      if (!raw) return;
      const state: InFlightState = JSON.parse(raw);
      if (Date.now() - state.timestamp > INFLIGHT_MAX_AGE) {
        localStorage.removeItem(INFLIGHT_KEY);
        return;
      }
      // Restore state
      setMessages(state.messages);
      setJobDescription(state.jobDescription);
      setLastQuestion(state.currentQuestion);
      setActiveChatId(state.chatId);
      if (state.partialAnswer) {
        setInterruptedAnswer(state.partialAnswer);
      }
      setShowRetry(true);
      localStorage.removeItem(INFLIGHT_KEY);
    } catch {
      // Corrupted JSON — discard silently
      localStorage.removeItem(INFLIGHT_KEY);
    }
  }, []);
```

- [ ] **Step 6: Update handleQuestion to integrate stall phrases, budget tracking, and in-flight persistence**

Replace the entire `handleQuestion` callback with:

```typescript
  const handleQuestion = useCallback(
    async (question: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const newMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(newMessages);
      setStreamingAnswer("");
      setLoading(true);
      setStreaming(false);
      setError("");
      setShowRetry(false);
      setInterruptedAnswer("");
      setLastQuestion(question);
      partialAnswerRef.current = "";

      // Show stall phrase immediately
      const phrase = getStallPhrase(question);
      setStallPhrase(phrase);
      stallMinElapsedRef.current = false;
      firstTokenReceivedRef.current = false;
      stallTimerRef.current = setTimeout(() => {
        stallMinElapsedRef.current = true;
        if (firstTokenReceivedRef.current) {
          setStallPhrase("");
        }
      }, 1500);

      // Estimate input cost
      const inputText = newMessages.map((m) => m.content).join("")
        + (resume?.text ?? "")
        + (jobDescription ?? "");
      addInputCost(inputText, settings.model);

      let fullAnswer = "";

      try {
        let first = true;
        // Start in-flight persistence
        startInflightPersistence();

        await streamAnswer(
          {
            messages: newMessages,
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKeys[settings.provider],
            resume: resume?.text,
            jobDescription: jobDescription || undefined,
          },
          (token) => {
            if (first) {
              setLoading(false);
              setStreaming(true);
              first = false;
              firstTokenReceivedRef.current = true;
              if (stallMinElapsedRef.current) {
                setStallPhrase("");
              }
            }
            fullAnswer += token;
            partialAnswerRef.current = fullAnswer;
            setStreamingAnswer((prev) => prev + token);
            // Live-update cost during streaming
            addOutputCost(token, settings.model);
          },
          controller.signal
        );

        // Final output cost reconciliation (tokens were tracked incrementally below)
        // No-op here — cost is already accumulated via onToken

        const finalMessages: ChatMessage[] = [
          ...newMessages,
          { role: "assistant", content: fullAnswer },
        ];
        setMessages(finalMessages);
        setStreamingAnswer("");
        setStallPhrase("");

        // Clear in-flight state on success
        stopInflightPersistence();
        clearInflight();

        // Save to chat history
        const chatId = saveChat(activeChatIdRef.current, finalMessages, jobDescription || undefined);
        setActiveChatId(chatId);
      } catch (err) {
        stopInflightPersistence();
        // Save final in-flight state before showing error
        saveInflight();

        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        setShowRetry(true);
        setStallPhrase("");
      } finally {
        setLoading(false);
        setStreaming(false);
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      }
    },
    [messages, settings, resume, jobDescription, saveChat, setActiveChatId,
     addInputCost, addOutputCost, startInflightPersistence, stopInflightPersistence,
     saveInflight, clearInflight]
  );
```

- [ ] **Step 7: Add retry handler (AFTER handleQuestion)**

Add this after the `handleQuestion` callback:

```typescript
  const handleRetry = useCallback(() => {
    if (!lastQuestion) return;
    setShowRetry(false);
    setInterruptedAnswer("");
    handleQuestion(lastQuestion);
  }, [lastQuestion, handleQuestion]);
```

- [ ] **Step 8: Update handleNewChat to reset budget and clear in-flight state**

Update the existing `handleNewChat` to also reset budget and clear in-flight:

```typescript
  const handleNewChat = useCallback(() => {
    if (messages.length > 0 && activeChatIdRef.current) {
      saveChat(activeChatIdRef.current, messages, jobDescription || undefined);
    }
    startNewChat();
    setMessages([]);
    setJobDescription("");
    setStreamingAnswer("");
    setError("");
    setLoading(false);
    setStreaming(false);
    setStallPhrase("");
    setShowRetry(false);
    setInterruptedAnswer("");
    setLastQuestion("");
    resetBudget();
    clearInflight();
  }, [messages, jobDescription, saveChat, startNewChat, resetBudget, clearInflight]);
```

- [ ] **Step 9: Update the AnswerDisplay JSX to pass new props**

Replace the `<AnswerDisplay>` component in the JSX with:

```typescript
          <AnswerDisplay
            messages={messages}
            streamingAnswer={streamingAnswer}
            loading={loading}
            error={error}
            stallPhrase={stallPhrase}
            showRetry={showRetry}
            onRetry={handleRetry}
            interruptedAnswer={interruptedAnswer}
            cost={cost}
            hasPricing={hasPricing(settings.model)}
            healthy={healthy}
          />
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `cd e:/Projects/interview-helper && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/components/AnswerDisplay.tsx src/App.tsx
git commit -m "feat: integrate stall phrases, crash recovery, retry, budget, and health into App and AnswerDisplay"
```

---

### Task 9: Manual End-to-End Verification

- [ ] **Step 1: Start the dev server**

Run: `cd e:/Projects/interview-helper && npm run dev`
Expected: Both Vite and Express start without errors

- [ ] **Step 2: Verify health indicator**

Open the app in browser. Confirm a small green dot appears in the UI. Stop the server — confirm the dot turns red within 30 seconds. Restart the server — confirm it turns green again.

- [ ] **Step 3: Verify stall phrases**

Ask a question (type or use mic). Immediately after tapping Send, confirm:
- A stall phrase appears instantly in italic/muted style
- After the first AI token arrives (and at least 1.5s has passed), the stall phrase disappears
- The streaming answer appears below

- [ ] **Step 4: Verify bullet-point format**

Confirm the AI response comes back as bullet points (lines starting with `- `), not prose paragraphs. Confirm text is visibly larger than before.

- [ ] **Step 5: Verify retry on error**

Disconnect from internet (or stop the server) mid-stream. Confirm:
- After 10s of no tokens, "Connection lost — answer incomplete" error appears
- A "Retry" button appears
- Tapping Retry re-sends the same question

- [ ] **Step 6: Verify crash recovery**

While an answer is streaming, force-close the browser tab. Reopen the app. Confirm:
- Chat history is restored
- Partial answer shown with "Answer was interrupted" banner
- Retry button is available

- [ ] **Step 7: Verify cost indicator**

Confirm the cost indicator shows a dollar amount (e.g., "$0.01") that increases with each question. Confirm it turns red when it crosses $0.50.

- [ ] **Step 8: Verify build succeeds**

Run: `cd e:/Projects/interview-helper && npm run build`
Expected: Build completes with no errors

- [ ] **Step 9: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
