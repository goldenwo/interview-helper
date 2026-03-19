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

/**
 * On iOS, webkitSpeechRecognition activates a "PlayAndRecord" audio session.
 * After recognition stops, iOS doesn't always reset it — volume buttons
 * control call volume and mic-mute sounds fire on taps. Playing a brief
 * silent audio forces Safari to switch back to normal playback mode.
 */
let resetInFlight = false;
// Tracks the in-progress reset so the start path can await it before
// acquiring the audio session, preventing iOS session conflicts.
let resetPromise: Promise<void> = Promise.resolve();


// Warmup stream kept alive so the iOS audio session stays in PlayAndRecord
// mode until SpeechRecognition fires audiostart. Avoids a teardown/rebuild
// race that leaves the mic indicator on but the recognition receiving silence.
let warmupStream: MediaStream | null = null;
function releaseWarmupStream() {
  if (warmupStream) {
    warmupStream.getTracks().forEach((t) => t.stop());
    warmupStream = null;
  }
}

// Pre-built silent WAV: 0.1s mono 16-bit PCM at 44100Hz.
// Reused across all resetIOSAudioSession calls to avoid re-creating the buffer.
const SILENT_WAV_BLOB = (() => {
  const sampleRate = 44100;
  const numSamples = 4410;
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
  return new Blob([buf], { type: "audio/wav" });
})();

function resetIOSAudioSession(): void {
  if (!isIOS || resetInFlight) return;
  resetInFlight = true;

  const url = URL.createObjectURL(SILENT_WAV_BLOB);
  const audio = new Audio(url);
  resetPromise = new Promise<void>((resolve) => {
    const done = () => { URL.revokeObjectURL(url); resetInFlight = false; resolve(); };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    // Failsafe: if neither event fires (iOS kills the audio element early),
    // resolve after 500ms so resetInFlight never gets permanently stuck.
    setTimeout(done, 500);
    audio.play().catch(done);
  });
}

/**
 * On iOS Safari, after idle periods the audio session is silently killed.
 * Calling getUserMedia briefly before starting SpeechRecognition forces
 * iOS to re-acquire the audio session so the mic actually activates.
 */
async function warmIOSAudioSession(): Promise<void> {
  if (!isIOS) return;
  releaseWarmupStream();
  const gumPromise = navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    // Acquire mic to force iOS into PlayAndRecord audio session.
    // Keep the stream alive so the session stays warm — it's released
    // once SpeechRecognition fires audiostart (or on cleanup).
    // Previously, stopping the tracks immediately left a ~100ms gap
    // where the session could tear down before SpeechRecognition
    // re-acquired it, causing a silent-mic race condition.
    //
    // Race against a timeout: iOS can hang on getUserMedia after a
    // recent audio session reset, permanently blocking toggle().
    warmupStream = await Promise.race([
      gumPromise,
      new Promise<MediaStream>((_, reject) =>
        setTimeout(() => reject(new Error("getUserMedia timeout")), 3000)
      ),
    ]);
  } catch {
    // Permission denied, unavailable, or timeout — proceed without warmup.
    // recognition.start() may still work if the session is alive.
    // If getUserMedia is still pending (timeout case), stop its tracks
    // when it eventually resolves so the mic indicator doesn't stay lit.
    gumPromise.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    warmupStream = null;
  }
}

export default function Recorder({ onQuestion, onCancel, disabled, streaming }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Track whether user intends to keep listening (for iOS auto-restart)
  const wantsListeningRef = useRef(false);
  const audioStartedRef = useRef(false);
  const retryCountRef = useRef(0);
  const warmupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents a second tap from launching a parallel warmup while one is in progress.
  const warmingRef = useRef(false);
  // Guards against toggle continuing after the component unmounts mid-await.
  const disposedRef = useRef(false);

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
    disposedRef.current = false;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && recognitionRef.current) {
        // Page came back from background — existing recognition is likely dead.
        // If we were listening, we'll need to restart on next user tap.
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
        wantsListeningRef.current = false;
        clearWarmupTimeout();
        releaseWarmupStream();
        setListening(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposedRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      wantsListeningRef.current = false;
      clearWarmupTimeout();
      releaseWarmupStream();
      resetIOSAudioSession();
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
      releaseWarmupStream();
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

      // On iOS (non-continuous), auto-restart if user still wants to listen
      if (isIOS && wantsListeningRef.current) {
        try {
          recognitionRef.current = null;
          startRecognition();
          return;
        } catch {
          // Fall through to stop listening
        }
      }

      wantsListeningRef.current = false;
      releaseWarmupStream();
      setListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") { releaseWarmupStream(); return; }

      // "no-speech" on iOS just means the one-shot timed out — restart silently
      if (isIOS && event.error === "no-speech" && wantsListeningRef.current) return;

      console.error("Speech recognition error:", event.error);
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission denied. Check your browser settings.",
        "no-speech": "No speech detected. Tap the mic and try again.",
        "network": "Network error — speech recognition requires an internet connection.",
        "service-not-allowed": "Speech recognition is not available in this browser.",
      };
      setError(messages[event.error] || `Speech recognition error: ${event.error}`);
      if (recognitionRef.current === recognition) {
        wantsListeningRef.current = false;
        setListening(false);
        releaseWarmupStream();
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
            !audioStartedRef.current &&
            wantsListeningRef.current
          ) {
            try { recognition.abort(); } catch { /* ignore */ }
            recognitionRef.current = null;
            if (retryCountRef.current < 1) {
              retryCountRef.current++;
              releaseWarmupStream();
              // warmIOSAudioSession() is intentionally skipped here — the audio
              // session was warmed <1.5s ago so it's still in PlayAndRecord mode.
              startRecognition();
            } else {
              retryCountRef.current = 0;
              wantsListeningRef.current = false;
              setListening(false);
              releaseWarmupStream();
              setError("Microphone failed to activate. Try tapping the mic again.");
            }
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setError("Failed to start recording. Tap the mic to try again.");
      recognitionRef.current = null;
      wantsListeningRef.current = false;
      setListening(false);
      releaseWarmupStream();
    }
  }, []);

  function stopListening() {
    wantsListeningRef.current = false;
    clearWarmupTimeout();
    releaseWarmupStream();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    // resetIOSAudioSession() deliberately removed — the repeated reset/warm
    // cycle degrades iOS audio routing, causing silent-mic after a few recordings.
    // Downside: volume buttons may show call-volume HUD while the page is open.
    setListening(false);
  }

  const toggle = useCallback(async () => {
    if (listening) {
      stopListening();
      return;
    }

    if (!SpeechRecognitionCtor) return;
    if (warmingRef.current) return;

    // Abort any leftover instance before creating a fresh one
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    await Promise.race([
      resetPromise,
      new Promise<void>((r) => setTimeout(r, 1000)),
    ]);

    warmingRef.current = true;
    try {
      await warmIOSAudioSession();
    } finally {
      warmingRef.current = false;
    }

    if (disposedRef.current) { releaseWarmupStream(); return; }

    wantsListeningRef.current = true;
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
