import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  onQuestion: (question: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
}

const SpeechRecognitionCtor =
  window.SpeechRecognition ?? window.webkitSpeechRecognition;

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && "ontouchend" in document);

export default function Recorder({ onQuestion, onCancel, disabled, streaming }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioStartedRef = useRef(false);
  const retryCountRef = useRef(0);
  const warmupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported = !!SpeechRecognitionCtor;

  function clearWarmupTimeout() {
    if (warmupTimeoutRef.current) {
      clearTimeout(warmupTimeoutRef.current);
      warmupTimeoutRef.current = null;
    }
  }

  // Kill stale recognition when page returns from background (iOS kills audio
  // session when backgrounded, so any existing instance is a zombie)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && recognitionRef.current) {
        // Page came back from background — existing recognition is likely dead.
        // If we were listening, we'll need to restart on next user tap.
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
        retryCountRef.current = 0;
        clearWarmupTimeout();
        setListening(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      clearWarmupTimeout();
    };
  }, []);

  // Dependency array is intentionally empty: all mutable data is accessed via
  // refs so the function identity remains stable for recursive auto-restart.
  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    // iOS Safari silently kills continuous sessions after idle periods.
    // Use one-shot mode on iOS and auto-restart via onend.
    recognition.continuous = !isIOS;

    recognition.addEventListener("audiostart", () => {
      audioStartedRef.current = true;
    });

    // Snapshot transcript accumulated from prior iOS one-shot sessions
    const previousTranscript = transcriptRef.current;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      const currentText = final || interim;
      const text = previousTranscript
        ? previousTranscript + " " + currentText
        : currentText;
      transcriptRef.current = text;
      setTranscript(text);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;

      // On iOS (non-continuous), auto-restart
      if (isIOS) {
        try {
          recognitionRef.current = null;
          startRecognition();
          return;
        } catch {
          // Fall through to stop listening
        }
      }

      setListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;

      // "no-speech" on iOS just means the one-shot timed out — restart silently via onend
      if (isIOS && event.error === "no-speech") return;

      console.error("Speech recognition error:", event.error);
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission denied. Check your browser settings.",
        "no-speech": "No speech detected. Tap the mic and try again.",
        "network": "Network error — speech recognition requires an internet connection.",
        "service-not-allowed": "Speech recognition is not available in this browser.",
      };
      setError(messages[event.error] || `Speech recognition error: ${event.error}`);
      if (recognitionRef.current === recognition) {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    audioStartedRef.current = false;

    try {
      recognition.start();
      setListening(true);
      setError("");

      // Safety net: if mic never actually activates within 1.5s, abort and
      // auto-retry once (handles iOS zombie audio session edge case)
      if (isIOS) {
        clearWarmupTimeout();
        warmupTimeoutRef.current = setTimeout(() => {
          if (
            recognitionRef.current === recognition &&
            !audioStartedRef.current
          ) {
            try { recognition.abort(); } catch { /* ignore */ }
            recognitionRef.current = null;
            if (retryCountRef.current < 1) {
              retryCountRef.current++;
              startRecognition();
            } else {
              retryCountRef.current = 0;
              setListening(false);
              setError("Microphone failed to activate. Try tapping the mic again.");
            }
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setError("Failed to start recording. Tap the mic to try again.");
      recognitionRef.current = null;
      setListening(false);
    }
  }, []);

  function stopListening() {
    clearWarmupTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    // resetIOSAudioSession() deliberately not called — the repeated reset/warm
    // cycle degrades iOS audio routing, causing silent-mic after a few recordings.
    // Downside: volume buttons may show call-volume HUD while the page is open.
    setListening(false);
  }

  const toggle = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }

    if (!SpeechRecognitionCtor) return;

    // Abort any leftover instance before creating a fresh one
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    retryCountRef.current = 0;
    transcriptRef.current = "";
    setTranscript("");
    startRecognition();
  }, [listening, startRecognition]);

  function handleClear() {
    stopListening();
    transcriptRef.current = "";
    setTranscript("");
  }

  function handleSend() {
    const text = transcriptRef.current.trim();
    if (text) {
      stopListening();
      onQuestion(text);
      transcriptRef.current = "";
      setTranscript("");
    }
  }

  if (!supported) {
    return (
      <p style={{ color: "var(--danger)", textAlign: "center" }}>
        Speech recognition is not supported in this browser. Use Chrome on
        Android or Safari on iOS for the best experience.
      </p>
    );
  }

  return (
    <div style={styles.wrapper}>
      {transcript && (
        <div style={styles.transcriptBox}>
          <p style={styles.transcriptLabel}>Heard:</p>
          <p style={styles.transcriptText}>{transcript}</p>
        </div>
      )}

      <div style={styles.controls}>
        <button
          onClick={toggle}
          disabled={disabled && !listening}
          style={{
            ...styles.micButton,
            background: listening ? "var(--danger)" : "var(--accent)",
            boxShadow: listening
              ? "0 0 24px rgba(248,113,113,0.4)"
              : "0 0 24px var(--accent-glow)",
          }}
          aria-label={listening ? "Stop listening" : "Start listening"}
        >
          {listening ? "⏹" : "🎤"}
        </button>

        {transcript.trim() && (
          <button onClick={handleSend} style={styles.sendButton}>
            Send ➤
          </button>
        )}

        {transcript.trim() && !listening && (
          <button onClick={handleClear} style={styles.cancelButton}>
            Clear ✕
          </button>
        )}

        {streaming && !listening && !transcript.trim() && (
          <button onClick={onCancel} style={styles.cancelButton}>
            Cancel ✕
          </button>
        )}
      </div>

      {error && (
        <p style={styles.errorText}>{error}</p>
      )}

      <p style={styles.hint}>
        {streaming
          ? "Streaming answer… tap Cancel to stop"
          : disabled
          ? "Getting answer…"
          : listening
          ? "Listening… tap ⏹ to stop, or Send to submit now"
          : transcript.trim()
          ? "Tap Send to submit, or Clear to discard"
          : "Tap the mic and ask your question"}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  transcriptBox: {
    width: "100%",
    background: "var(--bg-surface)",
    borderRadius: 12,
    padding: "10px 14px",
  },
  transcriptLabel: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  transcriptText: {
    fontSize: "0.95rem",
    lineHeight: 1.4,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: "none",
    fontSize: "1.6rem",
    cursor: "pointer",
    transition: "transform 0.15s, box-shadow 0.3s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    padding: "10px 20px",
    borderRadius: 24,
    border: "none",
    background: "var(--accent)",
    color: "var(--bg)",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "10px 20px",
    borderRadius: 24,
    border: "none",
    background: "var(--danger)",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  errorText: {
    fontSize: "0.85rem",
    color: "var(--danger)",
    textAlign: "center" as const,
    padding: "0 16px",
  },
  hint: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
};
