import Anthropic from "@anthropic-ai/sdk";
import type { ProviderAdapter, StreamParams } from "../types.js";

export const anthropicAdapter: ProviderAdapter = {
  async *stream(params: StreamParams): AsyncIterable<string> {
    const client = new Anthropic({ apiKey: params.apiKey });

    const stream = client.messages.stream(
      {
        model: params.model,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: params.maxTokens,
        temperature: params.temperature,
      },
      { signal: params.signal }
    );

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  },
};
