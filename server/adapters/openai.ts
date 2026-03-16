import OpenAI from "openai";
import type { ProviderAdapter, StreamParams } from "../types.js";

export const openaiAdapter: ProviderAdapter = {
  async *stream(params: StreamParams): AsyncIterable<string> {
    const client = new OpenAI({ apiKey: params.apiKey });

    const stream = await client.chat.completions.create(
      {
        model: params.model,
        messages: [
          { role: "system" as const, content: params.systemPrompt },
          ...params.messages,
        ],
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: true,
      },
      { signal: params.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  },
};
