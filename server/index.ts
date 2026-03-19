import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";
import type { AnswerRequest, Provider, ProviderAdapter } from "./types.js";
import { openaiAdapter } from "./adapters/openai.js";
import { anthropicAdapter } from "./adapters/anthropic.js";
import { googleAdapter } from "./adapters/google.js";
import { transcribe } from "./adapters/whisper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const MAX_QUESTION_LENGTH = 1000;
const MAX_CONCURRENT_PER_IP = 2;

// --- Security middleware ---

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: ALLOWED_ORIGIN }));

// 100kb covers max resume (10k chars) + max JD (10k chars) + 10 history messages + overhead
app.use(express.json({ limit: "100kb" }));

// Health check — registered before rate limiter so pings don't count
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const isDev = process.env.NODE_ENV !== "production";

app.use(
  "/api/",
  rateLimit({
    windowMs: 60_000,
    max: 10,
    skip: isDev ? () => true : () => false,
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

// Sweep expired token buckets hourly to prevent unbounded Map growth.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of tokenUsage) {
    if (now >= entry.resetAt) tokenUsage.delete(ip);
  }
}, 3_600_000).unref();

// --- Shared error helpers ---

function resolveApiError(err: unknown): { status: number; message: string } {
  const errAny = err as Record<string, unknown>;
  const status =
    typeof errAny.status === "number" ? errAny.status :
    typeof errAny.statusCode === "number" ? errAny.statusCode :
    typeof errAny.httpErrorCode === "number" ? errAny.httpErrorCode :
    500;
  const message =
    status === 401
      ? "Invalid API key"
      : status === 429
      ? "Rate limit or quota exceeded — check your API key billing"
      : err instanceof Error
      ? err.message
      : "Request failed";
  return { status: status >= 400 && status < 600 ? status : 502, message };
}

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

Format your response as 3-5 concise bullet points using "- " prefix. Each bullet should be a short phrase or single sentence — not a paragraph. The user will paraphrase these, so keep them scannable. No other markdown formatting (no headers, bold, code blocks, etc.).

Keep answers concise enough to glance at on a phone.`;

const MAX_CONTEXT_LENGTH = 10_000;

function buildSystemPrompt(resume?: string, jobDescription?: string): string {
  let prompt = SYSTEM_PROMPT;

  if (resume) {
    prompt += `\n\nHere is the user's resume for reference:\n---\n${resume}\n---`;
  }

  if (jobDescription) {
    prompt += `\n\nHere is the job description the user is interviewing for:\n---\n${jobDescription}\n---`;
  }

  if (resume || jobDescription) {
    prompt += `\n\nUse this context to tailor your responses. Reference specific experience from the resume and align answers with the job requirements.`;
  }

  return prompt;
}

// --- Client error logging (appears in Render logs) ---

app.post("/api/log", (req, res) => {
  const { level, message, detail } = req.body ?? {};
  const safeLevel = level === "warn" ? "warn" : level === "info" ? "info" : "error";
  const safeMsg = String(message ?? "unknown").slice(0, 500).replace(/[\x00-\x1f]/g, "");
  const safeDtl = detail ? String(detail).slice(0, 500).replace(/[\x00-\x1f]/g, "") : "";
  const ua = req.headers["user-agent"] ?? "unknown-ua";
  const entry = `[client:${safeLevel}] ${safeMsg}${safeDtl ? " | " + safeDtl : ""} [ua: ${ua}]`;
  if (safeLevel === "info") console.log(entry);
  else if (safeLevel === "warn") console.warn(entry);
  else console.error(entry);
  res.status(204).end();
});

// --- PDF extraction (server-side, avoids iOS browser incompatibilities) ---

const MAX_PDF_SIZE = 1_000_000; // 1MB

// Lazily loaded on first PDF request so startup is not blocked by this import.
let pdfjsLib: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

app.post("/api/extract-pdf", express.raw({ type: "application/pdf", limit: "1mb" }), async (req, res) => {
  if (!req.body?.length) {
    res.status(400).json({ error: "No PDF data received" });
    return;
  }
  if (req.body.length > MAX_PDF_SIZE) {
    res.status(400).json({ error: "File must be under 1MB" });
    return;
  }
  try {
    if (!pdfjsLib) pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(req.body).buffer;
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items.map((item: Record<string, unknown>) => (typeof item.str === "string" ? item.str : "")).join(" ");
      })
    );
    const text = pages.join("\n\n");
    res.json({ text });
  } catch (err) {
    console.error("PDF extraction error:", err);
    res.status(500).json({ error: "Failed to extract text from PDF" });
  }
});

// --- Whisper transcription ---

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB cap

app.post("/api/transcribe", (req, res, next) => {
  upload.single("audio")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Audio file too large (max 5MB)" });
        return;
      }
      res.status(400).json({ error: "File upload error" });
      return;
    }
    next();
  });
}, async (req, res) => {
  const start = Date.now();
  const ip = req.ip ?? "unknown";
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No audio file uploaded" });
    return;
  }

  if (!file.mimetype.startsWith("audio/")) {
    res.status(400).json({ error: `Invalid MIME type: ${file.mimetype}` });
    return;
  }

  console.log(`[transcribe] ${ip} — ${file.size} bytes, ${file.mimetype}`);

  const apiKey = (req.body?.apiKey as string | undefined) || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(400).json({
      error: "An OpenAI API key is required for transcription. Add one in Settings or set OPENAI_API_KEY in .env",
    });
    return;
  }

  try {
    const text = await transcribe(file.buffer, file.mimetype, apiKey);
    const elapsed = Date.now() - start;
    console.log(`[transcribe] ${ip} — done in ${elapsed}ms`);
    res.json({ text });
  } catch (err) {
    console.error("[transcribe] error:", err);
    const { status, message } = resolveApiError(err);
    res.status(status).json({ error: message });
  }
});

// --- Routes ---

const MAX_HISTORY_MESSAGES = 10;
const VALID_PROVIDERS = Object.keys(adapters) as Provider[];

app.post("/api/answer", async (req, res) => {
  const { messages, provider, model, apiKey, resume, jobDescription } = req.body as Partial<AnswerRequest>;

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
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    res.status(400).json({ error: `Unknown provider "${provider}". Must be one of: ${VALID_PROVIDERS.join(", ")}` });
    return;
  }
  const resolvedProvider: Provider = provider;

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

  // Validate context fields
  if (resume !== undefined && typeof resume !== "string") {
    res.status(400).json({ error: "Resume must be a string" });
    return;
  }
  if (resume && resume.length > MAX_CONTEXT_LENGTH) {
    res.status(400).json({ error: `Resume too long (max ${MAX_CONTEXT_LENGTH} chars)` });
    return;
  }
  if (jobDescription !== undefined && typeof jobDescription !== "string") {
    res.status(400).json({ error: "Job description must be a string" });
    return;
  }
  if (jobDescription && jobDescription.length > MAX_CONTEXT_LENGTH) {
    res.status(400).json({ error: `Job description too long (max ${MAX_CONTEXT_LENGTH} chars)` });
    return;
  }

  // Check hourly token budget
  const ip = req.ip ?? "unknown";
  const usage = getTokenUsage(ip);
  if (usage.tokens >= MAX_TOKENS_PER_HOUR) {
    res.status(429).json({ error: "Hourly token limit exceeded — please wait before sending more requests" });
    return;
  }

  const adapter = adapters[resolvedProvider];
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  // Estimate input tokens for budget tracking
  const inputChars = trimmed.reduce((sum, m) => sum + m.content.length, 0)
    + (resume?.length ?? 0)
    + (jobDescription?.length ?? 0);
  addTokens(ip, Math.ceil(inputChars / 4));

  // Abort if the client disconnects
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    const tokenStream = adapter.stream({
      model: resolvedModel,
      apiKey: resolvedKey,
      messages: trimmed,
      systemPrompt: buildSystemPrompt(resume, jobDescription),
      maxTokens: 768,
      temperature: 0.4,
      signal: abortController.signal,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let outputChars = 0;
    for await (const token of tokenStream) {
      if (abortController.signal.aborted) break;
      outputChars += token.length;
      res.write(`data: ${JSON.stringify(token)}\n\n`);
    }
    addTokens(ip, Math.ceil(outputChars / 4));
    if (!abortController.signal.aborted) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err: unknown) {
    if (abortController.signal.aborted) return;
    console.error(`${resolvedProvider} error:`, err);

    const { status, message } = resolveApiError(err);

    if (!res.headersSent) {
      res.status(status).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
});

// --- Static files (production) ---
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", () => server.close());
