import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ProviderAdapter, StreamParams } from "../types.js";

export const googleAdapter: ProviderAdapter = {
  async *stream(params: StreamParams): AsyncIterable<string> {
    const genAI = new GoogleGenerativeAI(params.apiKey);
    const model = genAI.getGenerativeModel({
      model: params.model,
      generationConfig: {
        maxOutputTokens: params.maxTokens,
        temperature: params.temperature,
      },
      systemInstruction: params.systemPrompt,
    });

    // Convert ChatMessage[] to Google's Content[] format
    const history = params.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = params.messages[params.messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage.content);

    // Note: @google/generative-ai does not support AbortSignal in sendMessageStream.
    // Client disconnect is handled by the server loop checking abortController.signal.aborted.
    for await (const chunk of result.stream) {
      if (params.signal?.aborted) break;
      const text = chunk.text();
      if (text) yield text;
    }
  },
};
