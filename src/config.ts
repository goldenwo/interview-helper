import type { Provider } from "./types";

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250506"],
  google: ["gemini-2.0-flash", "gemini-2.5-pro"],
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export const PROVIDERS = Object.keys(PROVIDER_MODELS) as Provider[];

export const DEFAULT_PROVIDER: Provider = "openai";
export const DEFAULT_MODEL = "gpt-4o-mini";

export const MAX_CONTEXT_LENGTH = 10_000;
export const MAX_FILE_SIZE = 1_000_000; // 1MB

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "o1": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 0.003, output: 0.012 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-haiku-4-20250506": { input: 0.0008, output: 0.004 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-2.5-pro": { input: 0.00125, output: 0.01 },
};
