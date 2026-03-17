export type { ChatMessage } from "../types";
import type { Provider } from "../types";

export interface StreamAnswerParams {
  messages: { role: "user" | "assistant"; content: string }[];
  provider: Provider;
  model: string;
  apiKey?: string;
  resume?: string;
  jobDescription?: string;
}

/** Retry fetch once on network error (ECONNRESET from Vite proxy during tsx --watch restarts). */
async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  retries = 1,
  delayMs = 500
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    const isNetworkError = err instanceof TypeError;
    if (retries > 0 && isNetworkError && !init.signal?.aborted) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        init.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(init.signal!.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });
      return fetchWithRetry(input, init, retries - 1, delayMs);
    }
    throw err;
  }
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

  while (true) {
    const { done, value } = await reader.read();
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
}
