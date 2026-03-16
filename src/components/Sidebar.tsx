import type { StoredChat, Provider, Settings as SettingsType } from "../types";
import SettingsPanel from "./Settings";

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
}: Props) {
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
      {/* Backdrop (mobile only) */}
      {isOpen && <div style={styles.backdrop} onClick={onClose} />}

      <aside
        className="sidebar-desktop"
        style={{
          ...styles.sidebar,
          ...(isOpen ? styles.sidebarOpen : {}),
        }}
      >
        {/* Close button (mobile only) */}
        <button className="sidebar-close-button" style={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <button style={styles.newChatButton} onClick={handleNewChat}>
          + New Chat
        </button>

        <div style={styles.sectionLabel}>Recent Chats</div>

        <div style={styles.chatList}>
          {chats.length === 0 && (
            <p style={styles.emptyChatText}>No chats yet</p>
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

        <div style={styles.divider} />

        <div style={styles.sectionLabel}>Settings</div>
        <SettingsPanel
          settings={settings}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onApiKeyChange={onApiKeyChange}
        />
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
    marginBottom: 16,
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: "0.65rem",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  },
  chatList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minHeight: 0,
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
  divider: {
    height: 1,
    background: "#334155",
    margin: "12px 0",
    flexShrink: 0,
  },
};
