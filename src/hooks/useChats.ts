import { useState, useCallback } from "react";
import type { StoredChat, ChatMessage } from "../types";

const STORAGE_KEY = "interview-helper-chats";
const MAX_CHATS = 10;

function loadChats(): StoredChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data
  }
  return [];
}

function persistChats(chats: StoredChat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 50) return trimmed;
  // Truncate at word boundary
  const cut = trimmed.slice(0, 50);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

export function useChats() {
  const [chats, setChats] = useState<StoredChat[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const saveChat = useCallback(
    (id: string | null, messages: ChatMessage[]): string => {
      const now = Date.now();
      let chatId = id;

      setChats((prev) => {
        let next: StoredChat[];

        if (chatId) {
          // Update existing chat
          next = prev.map((c) =>
            c.id === chatId ? { ...c, messages, updatedAt: now } : c
          );
        } else {
          // Create new chat
          chatId = crypto.randomUUID();
          const newChat: StoredChat = {
            id: chatId,
            title: generateTitle(messages[0]?.content ?? "New chat"),
            messages,
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

        persistChats(next);
        return next;
      });

      return chatId!;
    },
    []
  );

  const loadChat = useCallback(
    (id: string): ChatMessage[] | null => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      setActiveChatId(id);
      return chat.messages;
    },
    [chats]
  );

  const startNewChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  return { chats, activeChatId, setActiveChatId, saveChat, loadChat, startNewChat };
}
