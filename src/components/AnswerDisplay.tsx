interface Props {
  answer: string;
  loading: boolean;
  error: string;
}

export default function AnswerDisplay({ answer, loading, error }: Props) {
  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.pulse}>Thinking…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p style={{ ...styles.largeText, color: "var(--danger)", fontSize: "1.2rem" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!answer) {
    return (
      <div style={styles.center}>
        <p style={styles.placeholder}>
          Your answer will appear here
        </p>
      </div>
    );
  }

  return (
    <div style={styles.answerWrap}>
      <p style={styles.largeText}>{answer}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: "flex",
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
  pulse: {
    fontSize: "1.4rem",
    color: "var(--accent)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  answerWrap: {
    width: "100%",
    padding: "8px 4px",
    overflowY: "auto",
  },
  largeText: {
    fontSize: "clamp(1.3rem, 5vw, 2rem)",
    lineHeight: 1.5,
    fontWeight: 500,
    whiteSpace: "pre-wrap" as const,
  },
};
