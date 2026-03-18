import { useState, useCallback } from "react";
import type { Settings, Provider } from "../types";
import { DEFAULT_PROVIDER, DEFAULT_MODEL, PROVIDER_MODELS } from "../config";

const STORAGE_KEY = "interview-helper-settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data — fall back to defaults
  }
  return {
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    apiKeys: {},
  };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded — settings persist in memory for this session
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setProvider = useCallback((provider: Provider) => {
    setSettingsState((prev) => {
      const models = PROVIDER_MODELS[provider];
      const next: Settings = {
        ...prev,
        provider,
        model: models[0], // default to first model for new provider
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const setModel = useCallback((model: string) => {
    updateSettings({ model });
  }, [updateSettings]);

  const setApiKey = useCallback((provider: Provider, key: string) => {
    setSettingsState((prev) => {
      const { [provider]: _removed, ...rest } = prev.apiKeys;
      const next: Settings = {
        ...prev,
        apiKeys: key ? { ...rest, [provider]: key } : rest,
      };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, setProvider, setModel, setApiKey };
}
