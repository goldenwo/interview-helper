import { useState, useCallback, useRef, useEffect } from "react";
import Recorder from "./components/Recorder";
import AnswerDisplay from "./components/AnswerDisplay";
import Sidebar from "./components/Sidebar";
import { streamAnswer } from "./api/getAnswer";
import { useSettings } from "./hooks/useSettings";
import { useChats } from "./hooks/useChats";
import { useResume } from "./hooks/useResume";
import { useBudget } from "./hooks/useBudget";
import { useHealth } from "./hooks/useHealth";
import { getStallPhrase } from "./utils/stallPhrases";
import type { ChatMessage, InFlightState } from "./types";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const { resume, setResume, clearResume } = useResume();
  const [stallPhrase, setStallPhrase] = useState("");
  const [showRetry, setShowRetry] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [interruptedAnswer, setInterruptedAnswer] = useState("");
  const { cost, addInputCost, addOutputCost, resetBudget, hasPricing } = useBudget();
  const { healthy } = useHealth();
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallMinElapsedRef = useRef(false);
  const firstTokenReceivedRef = useRef(false);
  const inflightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partialAnswerRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const { settings, setProvider, setModel, setApiKey } = useSettings();
  const { chats, activeChatId, setActiveChatId, saveChat, loadChat, startNewChat } = useChats();
  const activeChatIdRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Keep messages ref in sync for debounce effect
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Auto-save JD to active chat with debounce (only on JD changes)
  useEffect(() => {
    if (!activeChatIdRef.current || messagesRef.current.length === 0) return;
    const timer = setTimeout(() => {
      saveChat(activeChatIdRef.current!, messagesRef.current, jobDescription || undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [jobDescription, saveChat]);

  const INFLIGHT_KEY = "interview-helper-inflight";
  const INFLIGHT_MAX_AGE = 30 * 60 * 1000; // 30 minutes

  const saveInflight = useCallback(() => {
    const state: InFlightState = {
      chatId: activeChatIdRef.current ?? crypto.randomUUID(),
      messages: messagesRef.current,
      currentQuestion: lastQuestion,
      partialAnswer: partialAnswerRef.current,
      jobDescription,
      provider: settings.provider,
      model: settings.model,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(INFLIGHT_KEY, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — non-fatal
    }
  }, [lastQuestion, jobDescription, settings.provider, settings.model]);

  const clearInflight = useCallback(() => {
    localStorage.removeItem(INFLIGHT_KEY);
  }, []);

  const startInflightPersistence = useCallback(() => {
    if (inflightTimerRef.current) clearInterval(inflightTimerRef.current);
    inflightTimerRef.current = setInterval(saveInflight, 500);
  }, [saveInflight]);

  const stopInflightPersistence = useCallback(() => {
    if (inflightTimerRef.current) {
      clearInterval(inflightTimerRef.current);
      inflightTimerRef.current = null;
    }
  }, []);

  // Recover from crash/reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INFLIGHT_KEY);
      if (!raw) return;
      const state: InFlightState = JSON.parse(raw);
      if (Date.now() - state.timestamp > INFLIGHT_MAX_AGE) {
        localStorage.removeItem(INFLIGHT_KEY);
        return;
      }
      // Restore state
      setMessages(state.messages);
      setJobDescription(state.jobDescription);
      setLastQuestion(state.currentQuestion);
      setActiveChatId(state.chatId);
      if (state.partialAnswer) {
        setInterruptedAnswer(state.partialAnswer);
      }
      setShowRetry(true);
      localStorage.removeItem(INFLIGHT_KEY);
    } catch {
      // Corrupted JSON — discard silently
      localStorage.removeItem(INFLIGHT_KEY);
    }
  }, []);

  // Auto-scroll only when user is at the bottom
  useEffect(() => {
    if (!showScrollButton) {
      const el = mainRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingAnswer, loading, showScrollButton]);

  const handleScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = mainRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreaming(false);
  }, []);

  const handleQuestion = useCallback(
    async (question: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const newMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(newMessages);
      setStreamingAnswer("");
      setLoading(true);
      setStreaming(false);
      setError("");
      setShowRetry(false);
      setInterruptedAnswer("");
      setLastQuestion(question);
      partialAnswerRef.current = "";

      // Show stall phrase immediately
      const phrase = getStallPhrase(question);
      setStallPhrase(phrase);
      stallMinElapsedRef.current = false;
      firstTokenReceivedRef.current = false;
      stallTimerRef.current = setTimeout(() => {
        stallMinElapsedRef.current = true;
        if (firstTokenReceivedRef.current) {
          setStallPhrase("");
        }
      }, 1500);

      // Estimate input cost
      const inputText = newMessages.map((m) => m.content).join("")
        + (resume?.text ?? "")
        + (jobDescription ?? "");
      addInputCost(inputText, settings.model);

      let fullAnswer = "";

      try {
        let first = true;
        // Start in-flight persistence
        startInflightPersistence();

        await streamAnswer(
          {
            messages: newMessages,
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKeys[settings.provider],
            resume: resume?.text,
            jobDescription: jobDescription || undefined,
          },
          (token) => {
            if (first) {
              setLoading(false);
              setStreaming(true);
              first = false;
              firstTokenReceivedRef.current = true;
              if (stallMinElapsedRef.current) {
                setStallPhrase("");
              }
            }
            fullAnswer += token;
            partialAnswerRef.current = fullAnswer;
            setStreamingAnswer((prev) => prev + token);
            // Live-update cost during streaming
            addOutputCost(token, settings.model);
          },
          controller.signal
        );

        const finalMessages: ChatMessage[] = [
          ...newMessages,
          { role: "assistant", content: fullAnswer },
        ];
        setMessages(finalMessages);
        setStreamingAnswer("");
        setStallPhrase("");

        // Clear in-flight state on success
        stopInflightPersistence();
        clearInflight();

        // Save to chat history
        const chatId = saveChat(activeChatIdRef.current, finalMessages, jobDescription || undefined);
        setActiveChatId(chatId);
      } catch (err) {
        stopInflightPersistence();
        // Save final in-flight state before showing error
        saveInflight();

        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        setShowRetry(true);
        setStallPhrase("");
      } finally {
        setLoading(false);
        setStreaming(false);
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      }
    },
    [messages, settings, resume, jobDescription, saveChat, setActiveChatId,
     addInputCost, addOutputCost, startInflightPersistence, stopInflightPersistence,
     saveInflight, clearInflight]
  );

  const handleRetry = useCallback(() => {
    if (!lastQuestion) return;
    setShowRetry(false);
    setInterruptedAnswer("");
    handleQuestion(lastQuestion);
  }, [lastQuestion, handleQuestion]);

  const handleSelectChat = useCallback(
    (id: string) => {
      const result = loadChat(id);
      if (result) {
        setMessages(result.messages);
        setJobDescription(result.jobDescription ?? "");
        setStreamingAnswer("");
        setError("");
        setLoading(false);
        setStreaming(false);
      }
    },
    [loadChat]
  );

  const handleNewChat = useCallback(() => {
    if (messages.length > 0 && activeChatIdRef.current) {
      saveChat(activeChatIdRef.current, messages, jobDescription || undefined);
    }
    startNewChat();
    setMessages([]);
    setJobDescription("");
    setStreamingAnswer("");
    setError("");
    setLoading(false);
    setStreaming(false);
    setStallPhrase("");
    setShowRetry(false);
    setInterruptedAnswer("");
    setLastQuestion("");
    resetBudget();
    clearInflight();
  }, [messages, jobDescription, saveChat, startNewChat, resetBudget, clearInflight]);

  return (
    <div style={styles.outerContainer}>
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        settings={settings}
        onProviderChange={setProvider}
        onModelChange={setModel}
        onApiKeyChange={setApiKey}
        jobDescription={jobDescription}
        onJobDescriptionChange={setJobDescription}
        resume={resume}
        onResumeChange={setResume}
        onResumeClear={clearResume}
      />

      <div className="main-container" style={styles.container}>
        <header style={styles.header}>
          <button
            className="hamburger-button"
            style={styles.hamburger}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <h1 style={styles.title}>Interview Helper</h1>
          <div style={styles.badges}>
            {jobDescription && <span style={styles.badge}>{"\uD83D\uDCC4"} JD active</span>}
            {resume && <span style={styles.badge}>{"\uD83D\uDCCB"} Resume active</span>}
          </div>
        </header>

        <main
          ref={mainRef}
          style={styles.main}
          onScroll={handleScroll}
        >
          <AnswerDisplay
            messages={messages}
            streamingAnswer={streamingAnswer}
            loading={loading}
            error={error}
            stallPhrase={stallPhrase}
            showRetry={showRetry}
            onRetry={handleRetry}
            interruptedAnswer={interruptedAnswer}
            cost={cost}
            hasPricing={hasPricing(settings.model)}
            healthy={healthy}
          />

          <button
            onClick={scrollToBottom}
            style={{
              ...styles.scrollButton,
              opacity: showScrollButton ? 1 : 0,
              pointerEvents: showScrollButton ? "auto" : "none",
            }}
            aria-label="Scroll to bottom"
          >
            ↓
          </button>
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outerContainer: {
    display: "flex",
    height: "100%",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    flex: 1,
    minWidth: 0,
    padding: "env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 16px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "12px 0",
    flexShrink: 0,
    gap: 12,
  },
  hamburger: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.4rem",
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: 1,
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  badges: {
    display: "flex",
    gap: 6,
    marginLeft: "auto",
    flexShrink: 0,
  },
  badge: {
    background: "#164e63",
    color: "#38bdf8",
    fontSize: "0.6rem",
    padding: "2px 8px",
    borderRadius: 10,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  main: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  footer: {
    flexShrink: 0,
    padding: "16px 0",
    display: "flex",
    justifyContent: "center",
  },
  scrollButton: {
    position: "sticky",
    bottom: 8,
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "var(--bg-surface)",
    border: "1px solid #334155",
    color: "var(--accent)",
    fontSize: "1.1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    flexShrink: 0,
    zIndex: 10,
    transition: "opacity 0.2s ease",
  },
};
