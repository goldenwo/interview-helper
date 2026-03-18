import { useState, useCallback } from "react";
import type { StoredChat, ChatMessage } from "../types";
import { loadFromStorage, saveToStorage } from "../utils/storage";

const STORAGE_KEY = "interview-helper-chats";
export const MAX_CHATS = 10;

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 50) return trimmed;
  // Truncate at word boundary
  const cut = trimmed.slice(0, 50);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

export function useChats() {
  const [chats, setChats] = useState<StoredChat[]>(() => loadFromStorage<StoredChat[]>(STORAGE_KEY, []));
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const saveChat = useCallback(
    (id: string | null, messages: ChatMessage[], jobDescription?: string): string => {
      const now = Date.now();
      const chatId = id ?? crypto.randomUUID();

      setChats((prev) => {
        let next: StoredChat[];

        const existing = id ? prev.find((c) => c.id === chatId) : null;
        if (existing) {
          // Update existing chat
          next = prev.map((c) =>
            c.id === chatId
              ? { ...c, messages, ...(jobDescription !== undefined && { jobDescription }), updatedAt: now }
              : c
          );
        } else {
          // Create new chat (also handles the case where the ID was evicted)
          const newChat: StoredChat = {
            id: chatId,
            title: generateTitle(messages[0]?.content ?? "New chat"),
            messages,
            jobDescription,
            createdAt: now,
            updatedAt: now,
          };
          next = [newChat, ...prev];
        }

        // Sort by updatedAt descending
        next.sort((a, b) => b.updatedAt - a.updatedAt);

        // Evict oldest if over limit
        if (next.length > MAX_CHATS) {
          next = next.slice(0, MAX_CHATS);
        }

        saveToStorage(STORAGE_KEY, next);
        return next;
      });

      return chatId;
    },
    []
  );

  const loadChat = useCallback(
    (id: string): { messages: ChatMessage[]; jobDescription?: string } | null => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      setActiveChatId(id);
      return { messages: chat.messages, jobDescription: chat.jobDescription };
    },
    [chats]
  );

  const startNewChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  return { chats, activeChatId, setActiveChatId, saveChat, loadChat, startNewChat };
}
