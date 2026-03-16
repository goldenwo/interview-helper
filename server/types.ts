export type Provider = "openai" | "anthropic" | "google";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface AnswerRequest {
  messages: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey?: string;
}

export interface StreamParams {
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  stream(params: StreamParams): AsyncIterable<string>;
}
