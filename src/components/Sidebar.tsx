import { useState, useEffect, useRef } from "react";
import type { StoredChat, Provider, Settings as SettingsType, ResumeData } from "../types";
import { MAX_CHATS } from "../hooks/useChats";
import SettingsPanel from "./Settings";
import ContextPanel from "./ContextPanel";

type Tab = "chats" | "context" | "settings";

interface Props {
  chats: StoredChat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType;
  onProviderChange: (provider: Provider) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (provider: Provider, key: string) => void;
  jobDescription: string;
  onJobDescriptionChange: (jd: string) => void;
  resume: ResumeData | null;
  onResumeChange: (text: string, fileName?: string) => void;
  onResumeClear: () => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  isOpen,
  onClose,
  settings,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  jobDescription,
  onJobDescriptionChange,
  resume,
  onResumeChange,
  onResumeClear,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("chats");

  // Reset to chats tab when mobile sidebar reopens (not on desktop where isOpen doesn't toggle)
  const prevOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevOpen.current) setActiveTab("chats");
    prevOpen.current = isOpen;
  }, [isOpen]);

  const handleSelectChat = (id: string) => {
    onSelectChat(id);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  return (
    <>
      {isOpen && <div style={styles.backdrop} onClick={onClose} />}

      <aside
        className="sidebar-desktop"
        style={{
          ...styles.sidebar,
          ...(isOpen ? styles.sidebarOpen : {}),
        }}
      >
        <button className="sidebar-close-button" style={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <button style={styles.newChatButton} onClick={handleNewChat}>
          + New Chat
        </button>

        {/* Tab bar */}
        <div style={styles.tabBar} role="tablist">
          {(["chats", "context", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={styles.tabContent}>
          {activeTab === "chats" && (
            <div style={styles.chatList}>
              {chats.length === 0 && (
                <p style={styles.emptyChatText}>No chats yet</p>
              )}
              {chats.length >= MAX_CHATS && (
                <p style={styles.evictionNotice}>
                  Showing {MAX_CHATS} most recent — oldest removed when limit is reached
                </p>
              )}
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  style={{
                    ...styles.chatItem,
                    ...(chat.id === activeChatId ? styles.chatItemActive : {}),
                  }}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}

          {activeTab === "context" && (
            <ContextPanel
              jobDescription={jobDescription}
              onJobDescriptionChange={onJobDescriptionChange}
              resume={resume}
              onSwitchToSettings={() => setActiveTab("settings")}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              settings={settings}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
              onApiKeyChange={onApiKeyChange}
              resumeText={resume?.text ?? ""}
              resumeFileName={resume?.fileName}
              onResumeChange={onResumeChange}
              onResumeClear={onResumeClear}
            />
          )}
        </div>
      </aside>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 90,
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    background: "var(--bg)",
    borderRight: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
    padding: 16,
    zIndex: 100,
    transform: "translateX(-100%)",
    transition: "transform 0.2s ease",
    overflowY: "auto",
  },
  sidebarOpen: {
    transform: "translateX(0)",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: 4,
    display: "block",
  },
  newChatButton: {
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
    width: "100%",
    marginBottom: 12,
    marginTop: 24,
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #334155",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#64748b",
    fontSize: "0.7rem",
    fontWeight: 500,
    padding: "8px 4px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tabActive: {
    color: "#38bdf8",
    borderBottomColor: "#38bdf8",
  },
  tabContent: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  },
  chatList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  chatItem: {
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text-muted)",
    fontSize: "0.8rem",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexShrink: 0,
  },
  chatItemActive: {
    background: "var(--bg-surface)",
    color: "var(--text)",
    borderLeft: "3px solid var(--accent)",
  },
  emptyChatText: {
    color: "var(--text-muted)",
    fontSize: "0.75rem",
    fontStyle: "italic",
    padding: "8px 10px",
  },
  evictionNotice: {
    color: "var(--text-muted)",
    fontSize: "0.7rem",
    fontStyle: "italic",
    padding: "4px 10px 8px",
    borderBottom: "1px solid #334155",
    marginBottom: 4,
  },
};
