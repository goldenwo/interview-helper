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

export const DEFAULT_PROVIDER: Provider = "openai";
export const DEFAULT_MODEL = "gpt-4o-mini";
