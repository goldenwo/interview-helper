import { useState, useCallback, useRef, useEffect } from "react";
import Recorder from "./components/Recorder";
import AnswerDisplay from "./components/AnswerDisplay";
import { streamAnswer, type ChatMessage } from "./api/getAnswer";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingAnswer, loading]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreaming(false);
  }, []);

  const handleQuestion = useCallback(async (question: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Add the user message to the chat immediately
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setStreamingAnswer("");
    setLoading(true);
    setStreaming(false);
    setError("");

    let fullAnswer = "";

    try {
      let first = true;
      await streamAnswer(
        // Send current messages + the new question
        [...messages, { role: "user", content: question }],
        (token) => {
          if (first) {
            setLoading(false);
            setStreaming(true);
            first = false;
          }
          fullAnswer += token;
          setStreamingAnswer((prev) => prev + token);
        },
        controller.signal
      );

      // Stream finished — commit the full answer to messages
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullAnswer },
      ]);
      setStreamingAnswer("");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [messages]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Interview Helper</h1>
      </header>

      <main ref={mainRef} style={styles.main}>
        <AnswerDisplay
          messages={messages}
          streamingAnswer={streamingAnswer}
          loading={loading}
          error={error}
        />
      </main>

      <footer style={styles.footer}>
        <Recorder
          onQuestion={handleQuestion}
          onCancel={handleCancel}
          disabled={loading}
          streaming={streaming || loading}
        />
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
    flexDirection: "column",
  },
  footer: {
    flexShrink: 0,
    padding: "16px 0",
    display: "flex",
    justifyContent: "center",
  },
};
