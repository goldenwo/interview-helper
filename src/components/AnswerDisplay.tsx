import type { ChatMessage } from "../types";

interface Props {
  messages: ChatMessage[];
  streamingAnswer: string;
  loading: boolean;
  error: string;
  stallPhrase: string;
  showRetry: boolean;
  onRetry: () => void;
  interruptedAnswer: string;
}

export default function AnswerDisplay({
  messages,
  streamingAnswer,
  loading,
  error,
  stallPhrase,
  showRetry,
  onRetry,
  interruptedAnswer,
}: Props) {
  if (messages.length === 0 && !loading && !stallPhrase) {
    return (
      <div style={styles.center}>
        <p style={styles.placeholder}>Your answer will appear here</p>
      </div>
    );
  }

  return (
    <div style={styles.chatLog}>

      {messages.map((msg, i) => (
        <div key={`${i}-${msg.role}-${msg.content.slice(0, 16)}`} style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
          <p style={msg.role === "user" ? styles.userText : styles.answerText}>
            {msg.content}
          </p>
        </div>
      ))}

      {stallPhrase && !streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.stallText}>{stallPhrase}</p>
        </div>
      )}

      {interruptedAnswer && !streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.answerText}>{interruptedAnswer}</p>
          <div style={styles.interruptedBanner}>Answer was interrupted</div>
        </div>
      )}

      {streamingAnswer && (
        <div style={styles.assistantBubble}>
          <p style={styles.answerText}>{streamingAnswer}</p>
        </div>
      )}

      {loading && !stallPhrase && (
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

      {showRetry && (
        <button onClick={onRetry} style={styles.retryButton}>
          Retry
        </button>
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
    flexDirection: "column",
    gap: 16,
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
    fontSize: "clamp(1.25rem, 4vw, 1.6rem)",
    lineHeight: 1.5,
    fontWeight: 500,
    whiteSpace: "pre-wrap" as const,
  },
  stallText: {
    fontSize: "clamp(1.1rem, 3.5vw, 1.4rem)",
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-muted)",
    whiteSpace: "pre-wrap" as const,
  },
  interruptedBanner: {
    marginTop: 8,
    padding: "4px 10px",
    background: "#78350f",
    color: "#fbbf24",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontWeight: 500,
    display: "inline-block",
  },
  retryButton: {
    alignSelf: "center",
    padding: "10px 32px",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  pulse: {
    fontSize: "1.2rem",
    color: "var(--accent)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
};
