import { useState, useRef, useEffect, useCallback } from "react";
import { transcribeAudio } from "../api/transcribe";
import { serverLog } from "../api/log";
import { WHISPER_COST_PER_MINUTE } from "../config";

interface Props {
  onQuestion: (question: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
  apiKey?: string;
  onCost?: (amount: number) => void;
}

const MAX_RECORDING_SECONDS = 60;
const SILENCE_THRESHOLD = 20; // AnalyserNode byte value (0-255, 128 = silence)

function negotiateMimeType(): string {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  return "audio/mp4";
}

const supported = !!navigator.mediaDevices?.getUserMedia;

export default function Recorder({ onQuestion, onCancel, disabled, streaming, apiKey, onCost }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  const onCostRef = useRef(onCost);
  onCostRef.current = onCost;
  const abortRef = useRef<AbortController | null>(null);
  const recordingStartRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hadSpeechRef = useRef(false);
  const levelCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAndTranscribe = useCallback(async (recorder: MediaRecorder, stream: MediaStream) => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    // Release mic
    stream.getTracks().forEach(t => t.stop());

    // Wait for final data — set up onstop handler BEFORE calling stop()
    // to avoid race where stop() sets state to "inactive" synchronously
    // but the final ondataavailable fires asynchronously.
    const blob = await new Promise<Blob>((resolve) => {
      if (recorder.state === "inactive") {
        const mimeType = recorder.mimeType;
        resolve(new Blob(chunksRef.current, { type: mimeType }));
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType;
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    const durationSec = (Date.now() - recordingStartRef.current) / 1000;
    serverLog("info", `[recorder] Stopped — ${blob.size} bytes, ${blob.type}, ${durationSec.toFixed(1)}s`);

    // Clean up timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (capTimerRef.current) { clearTimeout(capTimerRef.current); capTimerRef.current = null; }
    if (levelCheckRef.current) { clearInterval(levelCheckRef.current); levelCheckRef.current = null; }
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setRecording(false);
    setElapsed(0);

    // Clean up audio context used for silence detection
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (blob.size === 0 || !hadSpeechRef.current) {
      setError("No speech detected. Tap the mic and try again.");
      stoppingRef.current = false;
      return;
    }

    // Transcribe
    setTranscribing(true);
    const start = Date.now();
    serverLog("info", "[recorder] Transcription request sent");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const text = await transcribeAudio(blob, apiKeyRef.current, controller.signal);
      const latency = Date.now() - start;
      serverLog("info", `[recorder] Transcription received — ${latency}ms`);
      setTranscript(text);

      const minutes = durationSec / 60;
      onCostRef.current?.(minutes * WHISPER_COST_PER_MINUTE);
    } catch (err) {
      if (controller.signal.aborted) return;
      serverLog("error", "[recorder] Transcription error", err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : "Transcription failed. Tap the mic to try again.");
    } finally {
      abortRef.current = null;
      setTranscribing(false);
      stoppingRef.current = false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (recorder && stream) {
      stopAndTranscribe(recorder, stream);
    }
  }, [stopAndTranscribe]);

  // Visibility change: auto-stop when backgrounded
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && mediaRecorderRef.current && streamRef.current) {
        stopAndTranscribe(mediaRecorderRef.current, streamRef.current);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopAndTranscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (capTimerRef.current) clearTimeout(capTimerRef.current);
      if (levelCheckRef.current) clearInterval(levelCheckRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  async function startRecording() {
    setError("");
    setTranscript("");
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      serverLog("error", "[recorder] getUserMedia error", err instanceof Error ? err.message : String(err));
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone permission denied. Check your browser settings.");
      } else {
        setError("Failed to access microphone. Tap the mic to try again.");
      }
      return;
    }

    // Set up silence detection via AnalyserNode
    hadSpeechRef.current = false;
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    levelCheckRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const max = dataArray.reduce((a, b) => Math.max(a, b), 0);
      if (max > SILENCE_THRESHOLD) hadSpeechRef.current = true;
    }, 200);

    const mimeType = negotiateMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = recorder;
    streamRef.current = stream;

    recorder.start(1000);
    setRecording(true);
    setElapsed(0);
    recordingStartRef.current = Date.now();
    serverLog("info", `[recorder] Started — ${mimeType}`);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 1000);

    // 60s safety cap
    capTimerRef.current = setTimeout(() => {
      serverLog("info", "[recorder] 60s cap reached — auto-stopping");
      stopAndTranscribe(recorder, stream);
    }, MAX_RECORDING_SECONDS * 1000);
  }

  function toggle() {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function handleClear() {
    setTranscript("");
  }

  function handleSend() {
    const text = transcript.trim();
    if (text) {
      onQuestion(text);
      setTranscript("");
    }
  }

  if (!supported) {
    return (
      <p style={{ color: "var(--danger)", textAlign: "center" }}>
        Audio recording is not supported in this browser. Use a modern browser
        over HTTPS for the best experience.
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
          disabled={(disabled && !recording) || transcribing}
          style={{
            ...styles.micButton,
            background: recording ? "var(--danger)" : "var(--accent)",
            boxShadow: recording
              ? "0 0 24px rgba(248,113,113,0.4)"
              : "0 0 24px var(--accent-glow)",
          }}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          {recording ? "⏹" : "🎤"}
        </button>

        {transcript.trim() && (
          <button onClick={handleSend} style={styles.sendButton}>
            Send ➤
          </button>
        )}

        {transcript.trim() && !recording && (
          <button onClick={handleClear} style={styles.cancelButton}>
            Clear ✕
          </button>
        )}

        {streaming && !recording && !transcript.trim() && (
          <button onClick={onCancel} style={styles.cancelButton}>
            Cancel ✕
          </button>
        )}
      </div>

      {recording && (
        <p style={styles.elapsed}>{elapsed}s / {MAX_RECORDING_SECONDS}s</p>
      )}

      {error && (
        <p style={styles.errorText}>{error}</p>
      )}

      <p style={styles.hint}>
        {streaming
          ? "Streaming answer… tap Cancel to stop"
          : transcribing
          ? "Transcribing..."
          : disabled
          ? "Getting answer…"
          : recording
          ? "Recording… tap ⏹ to stop"
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
  elapsed: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
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
