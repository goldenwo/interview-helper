export type Provider = "openai" | "anthropic" | "google";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface Settings {
  provider: Provider;
  model: string;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
}

export interface StoredChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
