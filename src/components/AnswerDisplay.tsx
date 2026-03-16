import type { ChatMessage } from "../api/getAnswer";

interface Props {
  messages: ChatMessage[];
  streamingAnswer: string;
  loading: boolean;
  error: string;
}

export default function AnswerDisplay({ messages, streamingAnswer, loading, error }: Props) {
  if (messages.length === 0 && !loading) {
    return (
      <div style={styles.center}>
        <p style={styles.placeholder}>Your answer will appear here</p>
      </div>
    );
  }

  return (
    <div style={styles.chatLog}>
      {messages.map((msg, i) => (
        <div key={i} style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
          <p style={msg.role === "user" ? styles.userText : styles.answerText}>
            {msg.content}
          </p>
        </div>
      ))}

      {streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.answerText}>{streamingAnswer}</p>
        </div>
      )}

      {loading && (
        <div style={styles.assistantBubble}>
          <div style={styles.pulse}>Thinking…</div>
        </div>
      )}

      {error && (
        <div style={styles.assistantBubble}>
          <p style={{ ...styles.answerText, color: "var(--danger)", fontSize: "1rem" }}>
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    textAlign: "center",
    padding: 16,
  },
  placeholder: {
    color: "var(--text-muted)",
    fontSize: "1.1rem",
  },
  chatLog: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "8px 0",
    width: "100%",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "var(--accent)",
    color: "var(--bg)",
    borderRadius: "16px 16px 4px 16px",
    padding: "8px 14px",
    maxWidth: "85%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "var(--bg-surface)",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 14px",
    maxWidth: "100%",
    width: "100%",
  },
  userText: {
    fontSize: "0.9rem",
    lineHeight: 1.4,
  },
  answerText: {
    fontSize: "clamp(1.1rem, 4vw, 1.6rem)",
    lineHeight: 1.5,
    fontWeight: 500,
    whiteSpace: "pre-wrap" as const,
  },
  pulse: {
    fontSize: "1.2rem",
    color: "var(--accent)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
};
