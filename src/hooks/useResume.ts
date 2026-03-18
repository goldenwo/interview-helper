import { useState, useCallback } from "react";
import type { ResumeData } from "../types";
import { loadFromStorage, saveToStorage } from "../utils/storage";

const STORAGE_KEY = "interview-helper-resume";

export function useResume() {
  const [resume, setResumeState] = useState<ResumeData | null>(() => loadFromStorage<ResumeData | null>(STORAGE_KEY, null));

  const setResume = useCallback((text: string, fileName?: string) => {
    const data: ResumeData = { text, fileName, updatedAt: Date.now() };
    setResumeState(data);
    saveToStorage(STORAGE_KEY, data);
  }, []);

  const clearResume = useCallback(() => {
    setResumeState(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* non-fatal */ }
  }, []);

  return { resume, setResume, clearResume };
}
