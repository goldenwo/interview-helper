import { useState, useCallback } from "react";
import type { ResumeData } from "../types";

const STORAGE_KEY = "interview-helper-resume";

function loadResume(): ResumeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data
  }
  return null;
}

function persistResume(data: ResumeData | null) {
  try {
    if (data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage quota exceeded — resume persists in memory for this session
  }
}

export function useResume() {
  const [resume, setResumeState] = useState<ResumeData | null>(loadResume);

  const setResume = useCallback((text: string, fileName?: string) => {
    const data: ResumeData = { text, fileName, updatedAt: Date.now() };
    setResumeState(data);
    persistResume(data);
  }, []);

  const clearResume = useCallback(() => {
    setResumeState(null);
    persistResume(null);
  }, []);

  return { resume, setResume, clearResume };
}
