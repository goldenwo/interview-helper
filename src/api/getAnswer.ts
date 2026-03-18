export type { ChatMessage } from "../types";
import type { ChatMessage, Provider } from "../types";

export interface StreamAnswerParams {
  messages: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey?: string;
  resume?: string;
  jobDescription?: string;
}

/** Retry fetch once on network error or 502 (Vite proxy returns 502 when backend isn't ready). */
async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  retries = 1,
  delayMs = 500
): Promise<Response> {
  try {
    const res = await fetch(input, init);
    if (res.status === 502 && retries > 0 && !init.signal?.aborted) {
      await delayWithAbort(delayMs, init.signal);
      return fetchWithRetry(input, init, retries - 1, delayMs);
    }
    return res;
  } catch (err) {
    if (retries > 0 && err instanceof TypeError && !init.signal?.aborted) {
      await delayWithAbort(delayMs, init.signal);
      return fetchWithRetry(input, init, retries - 1, delayMs);
    }
    throw err;
  }
}

function delayWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function streamAnswer(
  params: StreamAnswerParams,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetchWithRetry(
    "/api/answer",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: params.messages,
        provider: params.provider,
        model: params.model,
        apiKey: params.apiKey,
        resume: params.resume,
        jobDescription: params.jobDescription,
      }),
      signal,
    },
    1,
    500
  );

  if (!res.ok || !res.body) {
    let message = `Server error ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // response wasn't JSON, keep default message
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const STREAM_TIMEOUT_MS = 10_000;

  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>(
      (_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Connection lost — answer incomplete")),
          STREAM_TIMEOUT_MS
        );
      }
    );
    const abortHandler = () => clearTimeout(timer);
    signal?.addEventListener("abort", abortHandler, { once: true });

    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([
        reader.read(),
        timeoutPromise,
      ]);
    } catch (e) {
      // Timeout fired — treat as disconnect
      signal?.removeEventListener("abort", abortHandler);
      reader.cancel().catch(() => {});
      throw e;
    }
    // Clear the timeout since reader.read() won the race
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortHandler);

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
        // SyntaxError means JSON.parse failed on a partial/malformed line — skip it.
        // Any other error (e.g. the server-sent error object) should propagate.
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  }
}
