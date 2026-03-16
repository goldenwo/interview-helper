import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  onQuestion: (question: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
}

const SpeechRecognitionCtor =
  window.SpeechRecognition ?? window.webkitSpeechRecognition;

export default function Recorder({ onQuestion, onCancel, disabled, streaming }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const supported = !!SpeechRecognitionCtor;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

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
      const text = final || interim;
      transcriptRef.current = text;
      setTranscript(text);
    };

    recognition.onend = () => {
      setListening(false);
      // Don't auto-submit — let the user review and tap Send
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    transcriptRef.current = "";
    setTranscript("");
  }, [listening, onQuestion]);

  function handleClear() {
    recognitionRef.current?.abort();
    setListening(false);
    transcriptRef.current = "";
    setTranscript("");
  }

  function handleSend() {
    if (transcriptRef.current.trim()) {
      recognitionRef.current?.abort();
      setListening(false);
      onQuestion(transcriptRef.current.trim());
      transcriptRef.current = "";
      setTranscript("");
    }
  }

  if (!supported) {
    return (
      <p style={{ color: "var(--danger)", textAlign: "center" }}>
        Speech recognition is not supported in this browser. Use Chrome on
        Android for the best experience.
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
  hint: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
};
