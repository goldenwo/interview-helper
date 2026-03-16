import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const MAX_QUESTION_LENGTH = 1000;
const MAX_CONCURRENT_PER_IP = 2;

// --- Security middleware ---

// Restrict CORS to the frontend origin
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Body size limit — conversation history can grow, but cap it
app.use(express.json({ limit: "50kb" }));

// Rate limit: 10 requests per minute per IP
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

// Optional bearer token auth (set API_SECRET in .env to enable)
const API_SECRET = process.env.API_SECRET;
if (API_SECRET) {
  app.use("/api/", (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token !== API_SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });
}

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

// --- OpenAI setup ---

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are the user's voice in a live interview. The user will relay what the interviewer says. Respond with exactly what the user should say back — written in first person as if the user is speaking directly to the interviewer. Do NOT explain things to the user or teach them. Just give them the words to say.

For coding challenges: "Here's my approach..." then the solution and a brief walkthrough as you'd narrate it to an interviewer.
For behavioral questions: answer in first person using STAR format — "In my previous role, I..."
For technical questions: answer confidently in first person — "The way I think about this is..."
For follow-ups: continue naturally in first person, in context of the conversation.

Keep answers concise enough to glance at on a phone. Use plain language, no markdown.`;

// --- Routes ---

const MAX_HISTORY_MESSAGES = 10; // keep last 5 Q&A pairs

type ChatMessage = { role: "user" | "assistant"; content: string };

app.post("/api/answer", async (req, res) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  // Validate and sanitize messages
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user" || !lastMessage.content?.trim()) {
    res.status(400).json({ error: "Last message must be a non-empty user message" });
    return;
  }

  if (lastMessage.content.length > MAX_QUESTION_LENGTH) {
    res
      .status(400)
      .json({ error: `Question too long (max ${MAX_QUESTION_LENGTH} chars)` });
    return;
  }

  // Trim history to the most recent exchanges
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  // Abort the OpenAI stream if the client disconnects
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    const stream = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...trimmed,
        ],
        max_tokens: 512,
        temperature: 0.4,
        stream: true,
      },
      { signal: abortController.signal }
    );

    // Only set SSE headers after the OpenAI call succeeds, so we can
    // still return a proper HTTP error status if it fails immediately.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) res.write(`data: ${JSON.stringify(delta)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    if (abortController.signal.aborted) return; // client disconnected
    console.error("OpenAI error:", err);

    const status = (err as { status?: number }).status;
    const message =
      status === 429
        ? "OpenAI rate limit or quota exceeded — check your API key billing"
        : status === 401
        ? "Invalid OpenAI API key"
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

// Graceful shutdown
process.on("SIGTERM", () => server.close());
