import type { ResumeData } from "../types";
import { MAX_CONTEXT_LENGTH } from "../config";
import FileUploader from "./FileUploader";
import shared from "./sidebarStyles";

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
        maxLength={MAX_CONTEXT_LENGTH}
      />
      <span style={styles.charCount}>
        {jobDescription.length.toLocaleString()} / {MAX_CONTEXT_LENGTH.toLocaleString()}
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
  ...shared,
  clearButton: { ...shared.clearButton, alignSelf: "flex-start" },
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
};
