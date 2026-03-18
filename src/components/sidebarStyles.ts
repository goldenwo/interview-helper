/** Shared styles used by sidebar panels (Settings, ContextPanel). */
const sidebarStyles: Record<string, React.CSSProperties> = {
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
  },
  charCount: {
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    textAlign: "right" as const,
  },
  divider: {
    height: 1,
    background: "#334155",
    margin: "8px 0",
  },
};

export default sidebarStyles;
