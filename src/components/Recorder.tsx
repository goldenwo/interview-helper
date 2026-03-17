import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  onQuestion: (question: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
}

const SpeechRecognitionCtor =
  window.SpeechRecognition ?? window.webkitSpeechRecognition;

/**
 * On iOS, webkitSpeechRecognition activates a "PlayAndRecord" audio session.
 * After recognition stops, iOS doesn't always reset it — volume buttons
 * control call volume and mic-mute sounds fire on taps. Playing a brief
 * silent audio forces Safari to switch back to normal playback mode.
 */
let resetInFlight = false;

function resetIOSAudioSession(): void {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && "ontouchend" in document);
  if (!isIOS || resetInFlight) return;
  resetInFlight = true;

  const sampleRate = 44100;
  const numSamples = 4410; // 0.1 seconds
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // 16-bit
  w(36, "data");
  v.setUint32(40, dataBytes, true);
  // remaining bytes are 0 = silence

  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  const audio = new Audio(url);
  const done = () => { URL.revokeObjectURL(url); resetInFlight = false; };
  audio.addEventListener("ended", done, { once: true });
  audio.addEventListener("error", done, { once: true });
  audio.play().catch(done);
}

export default function Recorder({ onQuestion, onCancel, disabled, streaming }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const supported = !!SpeechRecognitionCtor;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      // Best-effort: may be blocked by autoplay policy outside user gesture
      resetIOSAudioSession();
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      resetIOSAudioSession();
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
        const messages: Record<string, string> = {
          "not-allowed": "Microphone permission denied. Check your browser settings.",
          "no-speech": "No speech detected. Tap the mic and try again.",
          "network": "Network error — speech recognition requires an internet connection.",
          "service-not-allowed": "Speech recognition is not available in this browser.",
        };
        setError(messages[event.error] || `Speech recognition error: ${event.error}`);
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setError("");
    transcriptRef.current = "";
    setTranscript("");
  }, [listening, onQuestion]);

  function handleClear() {
    recognitionRef.current?.abort();
    resetIOSAudioSession();
    setListening(false);
    transcriptRef.current = "";
    setTranscript("");
  }

  function handleSend() {
    if (transcriptRef.current.trim()) {
      recognitionRef.current?.abort();
      resetIOSAudioSession();
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
