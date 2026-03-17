import type { ResumeData } from "../types";
import FileUploader from "./FileUploader";

const MAX_JD_LENGTH = 10_000;

interface Props {
  jobDescription: string;
  onJobDescriptionChange: (jd: string) => void;
  resume: ResumeData | null;
  onSwitchToSettings: () => void;
}

export default function ContextPanel({
  jobDescription,
  onJobDescriptionChange,
  resume,
  onSwitchToSettings,
}: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.label}>Job Description</div>
      <textarea
        value={jobDescription}
        onChange={(e) => onJobDescriptionChange(e.target.value)}
        placeholder="Paste the job description here..."
        style={styles.textarea}
        rows={6}
        maxLength={MAX_JD_LENGTH}
      />
      <span style={styles.charCount}>
        {jobDescription.length.toLocaleString()} / {MAX_JD_LENGTH.toLocaleString()}
      </span>
      {jobDescription && (
        <button
          onClick={() => onJobDescriptionChange("")}
          style={styles.clearButton}
        >
          Clear
        </button>
      )}
      <FileUploader
        onExtracted={(text) => onJobDescriptionChange(text)}
      />

      <div style={styles.divider} />

      <div style={styles.label}>Resume</div>
      {resume ? (
        <div style={styles.resumeStatus}>
          <span style={styles.resumeLoaded}>
            Resume loaded (updated {new Date(resume.updatedAt).toLocaleDateString()})
          </span>
        </div>
      ) : (
        <p style={styles.noResume}>No resume set</p>
      )}
      <button onClick={onSwitchToSettings} style={styles.linkButton}>
        Edit in Settings &rarr;
      </button>
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
  textarea: {
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
  clearButton: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid #334155",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: "0.7rem",
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  divider: {
    height: 1,
    background: "#334155",
    margin: "8px 0",
  },
  resumeStatus: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  resumeLoaded: {
    fontSize: "0.8rem",
    color: "#4ade80",
  },
  noResume: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  linkButton: {
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: "0.75rem",
    cursor: "pointer",
    textAlign: "left",
    padding: 0,
    marginTop: 2,
  },
  charCount: {
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    textAlign: "right" as const,
  },
};
