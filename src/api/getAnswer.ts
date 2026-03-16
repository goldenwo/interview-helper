import type { ChatMessage } from "../types";
export type { ChatMessage } from "../types";

export async function streamAnswer(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

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
