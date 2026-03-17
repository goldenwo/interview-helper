import { useState, useEffect } from "react";
import type { Provider, Settings as SettingsType } from "../types";
import { PROVIDER_MODELS, PROVIDER_LABELS } from "../config";
import FileUploader from "./FileUploader";

const MAX_RESUME_LENGTH = 10_000;

interface Props {
  settings: SettingsType;
  onProviderChange: (provider: Provider) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (provider: Provider, key: string) => void;
  resumeText: string;
  resumeFileName?: string;
  onResumeChange: (text: string, fileName?: string) => void;
  onResumeClear: () => void;
}

const PROVIDERS: Provider[] = ["openai", "anthropic", "google"];

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 3) + "•••" + key.slice(-4);
}

export default function Settings({
  settings,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  resumeText,
  resumeFileName,
  onResumeChange,
  onResumeClear,
}: Props) {
  const models = PROVIDER_MODELS[settings.provider];
  const currentKey = settings.apiKeys[settings.provider] ?? "";

  // Buffer resume text locally to avoid writing to localStorage on every keystroke
  const [localResume, setLocalResume] = useState(resumeText);
  useEffect(() => { setLocalResume(resumeText); }, [resumeText]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>Provider</div>
      <select
        value={settings.provider}
        onChange={(e) => onProviderChange(e.target.value as Provider)}
        style={styles.select}
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>

      <div style={styles.label}>Model</div>
      <select
        value={settings.model}
        onChange={(e) => onModelChange(e.target.value)}
        style={styles.select}
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <div style={styles.label}>API Key</div>
      {currentKey ? (
        <div style={styles.keyRow}>
          <span style={styles.keyMask}>{maskKey(currentKey)} ✓</span>
          <button
            onClick={() => onApiKeyChange(settings.provider, "")}
            style={styles.clearButton}
          >
            Clear
          </button>
        </div>
      ) : (
        <input
          type="password"
          placeholder={`Enter ${PROVIDER_LABELS[settings.provider]} API key`}
          style={styles.input}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val) {
              onApiKeyChange(settings.provider, val);
              e.target.value = "";
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      )}

      <p style={styles.disclaimer}>Key stored locally in your browser.</p>

      <div style={styles.divider} />

      <div style={styles.label}>Resume</div>
      <textarea
        value={localResume}
        onChange={(e) => setLocalResume(e.target.value)}
        placeholder="Paste your resume here..."
        style={styles.resumeTextarea}
        rows={6}
        maxLength={MAX_RESUME_LENGTH}
        onBlur={() => {
          const val = localResume.trim();
          if (val !== resumeText) onResumeChange(val);
        }}
      />
      <span style={styles.charCount}>
        {localResume.length.toLocaleString()} / {MAX_RESUME_LENGTH.toLocaleString()}
      </span>
      {resumeText && (
        <div style={styles.keyRow}>
          {resumeFileName && (
            <span style={styles.keyMask}>{resumeFileName}</span>
          )}
          <button onClick={onResumeClear} style={styles.clearButton}>
            Clear
          </button>
        </div>
      )}
      <FileUploader onExtracted={onResumeChange} />
      <p style={styles.disclaimer}>Resume stored locally in your browser.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: "0.65rem",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: 4,
  },
  select: {
    background: "var(--bg-surface)",
    color: "var(--text)",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: "0.8rem",
    width: "100%",
    outline: "none",
    cursor: "pointer",
  },
  input: {
    background: "var(--bg-surface)",
    color: "var(--text)",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: "0.8rem",
    width: "100%",
    outline: "none",
  },
  keyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  keyMask: {
    fontSize: "0.8rem",
    color: "var(--accent)",
    flex: 1,
  },
  clearButton: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid #334155",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: "0.7rem",
    cursor: "pointer",
  },
  disclaimer: {
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    fontStyle: "italic",
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: "#334155",
    margin: "12px 0",
  },
  resumeTextarea: {
    background: "var(--bg-surface)",
    color: "var(--text)",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "8px",
    fontSize: "0.8rem",
    width: "100%",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
  },
  charCount: {
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    textAlign: "right" as const,
  },
};
