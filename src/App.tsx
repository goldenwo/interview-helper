import { useState, useCallback } from "react";
import Recorder from "./components/Recorder";
import AnswerDisplay from "./components/AnswerDisplay";
import { getAnswer } from "./api/getAnswer";

export default function App() {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleQuestion = useCallback(async (question: string) => {
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const text = await getAnswer(question);
      setAnswer(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Interview Helper</h1>
      </header>

      <main style={styles.main}>
        <AnswerDisplay answer={answer} loading={loading} error={error} />
      </main>

      <footer style={styles.footer}>
        <Recorder onQuestion={handleQuestion} disabled={loading} />
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    maxWidth: 600,
    margin: "0 auto",
    padding: "env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 16px)",
  },
  header: {
    textAlign: "center",
    padding: "12px 0",
    flexShrink: 0,
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  main: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexShrink: 0,
    padding: "16px 0",
    display: "flex",
    justifyContent: "center",
  },
};
