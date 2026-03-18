import { useState, useCallback } from "react";
import type { Settings, Provider } from "../types";
import { DEFAULT_PROVIDER, DEFAULT_MODEL, PROVIDER_MODELS } from "../config";
import { loadFromStorage, saveToStorage } from "../utils/storage";

const STORAGE_KEY = "interview-helper-settings";
const DEFAULT_SETTINGS: Settings = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  apiKeys: {},
};

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(() => loadFromStorage(STORAGE_KEY, DEFAULT_SETTINGS));

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(STORAGE_KEY, next);
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
      saveToStorage(STORAGE_KEY, next);
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
      saveToStorage(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { settings, setProvider, setModel, setApiKey };
}
