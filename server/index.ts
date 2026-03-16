import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { AnswerRequest, Provider, ProviderAdapter } from "./types.js";
import { openaiAdapter } from "./adapters/openai.js";
import { anthropicAdapter } from "./adapters/anthropic.js";
import { googleAdapter } from "./adapters/google.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const MAX_QUESTION_LENGTH = 1000;
const MAX_CONCURRENT_PER_IP = 2;

// --- Security middleware ---

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: ALLOWED_ORIGIN }));

app.use(express.json({ limit: "50kb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please wait a moment" },
  })
);

// Per-IP concurrency throttle
const inFlight = new Map<string, number>();
app.use("/api/", (req, res, next) => {
  const ip = req.ip ?? "unknown";
  const count = inFlight.get(ip) ?? 0;
  if (count >= MAX_CONCURRENT_PER_IP) {
    res.status(429).json({ error: "Too many concurrent requests" });
    return;
  }
  inFlight.set(ip, count + 1);
  res.on("close", () => {
    const current = inFlight.get(ip) ?? 1;
    if (current <= 1) inFlight.delete(ip);
    else inFlight.set(ip, current - 1);
  });
  next();
});

// --- Provider adapters ---

const adapters: Record<Provider, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

const ENV_KEY_MAP: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};

const SYSTEM_PROMPT = `You are the user's voice in a live interview. The user will relay what the interviewer says. Respond with exactly what the user should say back — written in first person as if the user is speaking directly to the interviewer. Do NOT explain things to the user or teach them. Just give them the words to say.

For coding challenges: "Here's my approach..." then the solution and a brief walkthrough as you'd narrate it to an interviewer.
For behavioral questions: answer in first person using STAR format — "In my previous role, I..."
For technical questions: answer confidently in first person — "The way I think about this is..."
For follow-ups: continue naturally in first person, in context of the conversation.

Keep answers concise enough to glance at on a phone. Use plain language, no markdown.`;

// --- Routes ---

const MAX_HISTORY_MESSAGES = 10;
const VALID_PROVIDERS: Provider[] = ["openai", "anthropic", "google"];

app.post("/api/answer", async (req, res) => {
  const { messages, provider, model, apiKey } = req.body as Partial<AnswerRequest>;

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user" || !lastMessage.content?.trim()) {
    res.status(400).json({ error: "Last message must be a non-empty user message" });
    return;
  }

  if (lastMessage.content.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Question too long (max ${MAX_QUESTION_LENGTH} chars)` });
    return;
  }

  // Validate provider
  const resolvedProvider: Provider = provider && VALID_PROVIDERS.includes(provider) ? provider : "openai";

  // Validate model (must be a non-empty string)
  const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : "gpt-4o-mini";

  // Resolve API key: request body → env var → error
  const resolvedKey = apiKey || process.env[ENV_KEY_MAP[resolvedProvider]];
  if (!resolvedKey) {
    res.status(400).json({
      error: `No API key provided for ${resolvedProvider}. Enter your key in Settings or set ${ENV_KEY_MAP[resolvedProvider]} in .env`,
    });
    return;
  }

  const adapter = adapters[resolvedProvider];
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  // Abort if the client disconnects
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    const tokenStream = adapter.stream({
      model: resolvedModel,
      apiKey: resolvedKey,
      messages: trimmed,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 512,
      temperature: 0.4,
      signal: abortController.signal,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const token of tokenStream) {
      if (abortController.signal.aborted) break;
      res.write(`data: ${JSON.stringify(token)}\n\n`);
    }
    if (!abortController.signal.aborted) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err: unknown) {
    if (abortController.signal.aborted) return;
    console.error(`${resolvedProvider} error:`, err);

    const status = (err as { status?: number }).status;
    const message =
      status === 429
        ? "Rate limit or quota exceeded — check your API key billing"
        : status === 401
        ? `Invalid ${resolvedProvider} API key`
        : err instanceof Error
        ? err.message
        : "Failed to get answer";

    if (!res.headersSent) {
      res.status(status === 429 || status === 401 ? status : 502).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
});

const server = app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", () => server.close());
