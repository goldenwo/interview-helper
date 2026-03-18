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

export interface ResumeData {
  text: string;
  fileName?: string;
  updatedAt: number;
}

export interface StoredChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  jobDescription?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InFlightState {
  chatId: string;
  messages: ChatMessage[];
  currentQuestion: string;
  partialAnswer: string;
  jobDescription: string;
  provider: Provider;
  model: string;
  timestamp: number;
}
