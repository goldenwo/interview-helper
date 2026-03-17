# Context Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add job description and resume context so AI interview responses are tailored to the specific role and user's background.

**Architecture:** Extend the existing localStorage-backed state model with a new `useResume` hook (global) and `jobDescription` field on chats (per-chat). Refactor the sidebar into a tabbed layout (Chats/Context/Settings). Server constructs a dynamic system prompt by appending context to the existing base prompt. File upload uses `pdfjs-dist` (lazy-loaded) for PDF text extraction.

**Tech Stack:** React 19, TypeScript, Express 5, pdfjs-dist, Vite 6

---

## File Structure

| File | Type | Responsibility |
|------|------|---------------|
| `src/types.ts` | Modify | Add `ResumeData` interface, extend `StoredChat` with `jobDescription` |
| `server/types.ts` | Modify | Add `resume`, `jobDescription` to `AnswerRequest` |
| `src/hooks/useResume.ts` | Create | localStorage-backed resume persistence (global) |
| `src/hooks/useChats.ts` | Modify | Extend `saveChat`/`loadChat` signatures for `jobDescription` |
| `src/api/getAnswer.ts` | Modify | Add `resume`/`jobDescription` to `StreamAnswerParams` and request body |
| `server/index.ts` | Modify | Dynamic system prompt construction, body size limit bump |
| `src/components/FileUploader.tsx` | Create | Reusable PDF/TXT file upload + text extraction |
| `src/components/ContextPanel.tsx` | Create | JD textarea + upload, resume status display |
| `src/components/Settings.tsx` | Modify | Add resume management section at bottom |
| `src/components/Sidebar.tsx` | Modify | Refactor to tabbed layout (Chats/Context/Settings) |
| `src/App.tsx` | Modify | Wire resume/JD state, pass to API, render context badges |

---

## Chunk 1: Data Layer (Types, Hooks, API, Backend)

### Task 1: Extend Type Definitions

**Files:**
- Modify: `src/types.ts:1-21`
- Modify: `server/types.ts:1-10`

- [ ] **Step 1: Add `ResumeData` interface and extend `StoredChat` in `src/types.ts`**

Add after the `Settings` interface (line 13):

```typescript
export interface ResumeData {
  text: string;
  fileName?: string;
  updatedAt: number;
}
```

Add `jobDescription?: string` to the `StoredChat` interface (after `messages` field, line 18):

```typescript
export interface StoredChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  jobDescription?: string;  // new
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add `resume` and `jobDescription` to `AnswerRequest` in `server/types.ts`**

```typescript
export interface AnswerRequest {
  messages: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey?: string;
  resume?: string;         // new
  jobDescription?: string; // new
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (new fields are optional, so existing code is unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts server/types.ts
git commit -m "feat: add ResumeData type and extend StoredChat/AnswerRequest for context"
```

---

### Task 2: Create `useResume` Hook

**Files:**
- Create: `src/hooks/useResume.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback } from "react";
import type { ResumeData } from "../types";

const STORAGE_KEY = "interview-helper-resume";

function loadResume(): ResumeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data
  }
  return null;
}

function persistResume(data: ResumeData | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useResume() {
  const [resume, setResumeState] = useState<ResumeData | null>(loadResume);

  const setResume = useCallback((text: string, fileName?: string) => {
    const data: ResumeData = { text, fileName, updatedAt: Date.now() };
    setResumeState(data);
    persistResume(data);
  }, []);

  const clearResume = useCallback(() => {
    setResumeState(null);
    persistResume(null);
  }, []);

  return { resume, setResume, clearResume };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useResume.ts
git commit -m "feat: add useResume hook for global resume persistence"
```

---

### Task 3: Extend `useChats` for Job Description

**Files:**
- Modify: `src/hooks/useChats.ts:34-84`
- Modify: `src/App.tsx:114-126` (adapt to new `loadChat` return type)

- [ ] **Step 1: Update `saveChat` to accept `jobDescription`**

Change the `saveChat` callback (line 34-73). The signature becomes `(id, messages, jobDescription?)`:

```typescript
  const saveChat = useCallback(
    (id: string | null, messages: ChatMessage[], jobDescription?: string): string => {
      const now = Date.now();
      const chatId = id ?? crypto.randomUUID();

      setChats((prev) => {
        let next: StoredChat[];

        if (id) {
          // Update existing chat
          next = prev.map((c) =>
            c.id === chatId
              ? { ...c, messages, ...(jobDescription !== undefined && { jobDescription }), updatedAt: now }
              : c
          );
        } else {
          // Create new chat
          const newChat: StoredChat = {
            id: chatId,
            title: generateTitle(messages[0]?.content ?? "New chat"),
            messages,
            jobDescription,
            createdAt: now,
            updatedAt: now,
          };
          next = [newChat, ...prev];
        }

        // Sort by updatedAt descending
        next.sort((a, b) => b.updatedAt - a.updatedAt);

        // Evict oldest if over limit
        if (next.length > MAX_CHATS) {
          next = next.slice(0, MAX_CHATS);
        }

        persistChats(next);
        return next;
      });

      return chatId;
    },
    []
  );
```

- [ ] **Step 2: Update `loadChat` to return `jobDescription`**

Change the return type and implementation (line 76-83):

```typescript
  const loadChat = useCallback(
    (id: string): { messages: ChatMessage[]; jobDescription?: string } | null => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      setActiveChatId(id);
      return { messages: chat.messages, jobDescription: chat.jobDescription };
    },
    [chats]
  );
```

- [ ] **Step 3: Update `App.tsx` to handle new `loadChat` return type**

In `handleSelectChat` (line 114-126 of App.tsx), update the destructuring:

```typescript
  const handleSelectChat = useCallback(
    (id: string) => {
      const result = loadChat(id);
      if (result) {
        setMessages(result.messages);
        setStreamingAnswer("");
        setError("");
        setLoading(false);
        setStreaming(false);
      }
    },
    [loadChat]
  );
```

Note: JD state wiring in App.tsx will be completed in Task 9 (Chunk 2). For now, just handle the new return shape so the build passes.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useChats.ts src/App.tsx
git commit -m "feat: extend useChats with jobDescription support"
```

---

### Task 4: Extend Client API (`getAnswer.ts`)

**Files:**
- Modify: `src/api/getAnswer.ts:4-24`

- [ ] **Step 1: Add fields to `StreamAnswerParams` and request body**

Update the interface (line 4-9):

```typescript
export interface StreamAnswerParams {
  messages: { role: "user" | "assistant"; content: string }[];
  provider: Provider;
  model: string;
  apiKey?: string;
  resume?: string;
  jobDescription?: string;
}
```

Update the `body` in the fetch call (line 19-24):

```typescript
    body: JSON.stringify({
      messages: params.messages,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
      resume: params.resume,
      jobDescription: params.jobDescription,
    }),
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/getAnswer.ts
git commit -m "feat: include resume/jobDescription in API request"
```

---

### Task 5: Backend — Dynamic System Prompt & Validation

**Files:**
- Modify: `server/index.ts:25,70-77,84-85,127-131`

- [ ] **Step 1: Bump body size limit**

Change line 25 from:
```typescript
app.use(express.json({ limit: "50kb" }));
```
To:
```typescript
app.use(express.json({ limit: "100kb" }));
```

- [ ] **Step 2: Add system prompt builder function**

Add after the `SYSTEM_PROMPT` constant (after line 77):

```typescript
const MAX_CONTEXT_LENGTH = 10_000;

function buildSystemPrompt(resume?: string, jobDescription?: string): string {
  let prompt = SYSTEM_PROMPT;

  if (resume) {
    prompt += `\n\nHere is the user's resume for reference:\n---\n${resume.slice(0, MAX_CONTEXT_LENGTH)}\n---`;
  }

  if (jobDescription) {
    prompt += `\n\nHere is the job description the user is interviewing for:\n---\n${jobDescription.slice(0, MAX_CONTEXT_LENGTH)}\n---`;
  }

  if (resume || jobDescription) {
    prompt += `\n\nUse this context to tailor your responses. Reference specific experience from the resume and align answers with the job requirements.`;
  }

  return prompt;
}
```

- [ ] **Step 3: Update the route handler to validate and use context**

In the route handler (line 84-85), destructure the new fields:

```typescript
  const { messages, provider, model, apiKey, resume, jobDescription } = req.body as Partial<AnswerRequest>;
```

Add validation for context fields after the existing API key validation block (after line 117):

```typescript
  // Validate context fields
  if (resume && typeof resume === "string" && resume.length > MAX_CONTEXT_LENGTH) {
    res.status(400).json({ error: `Resume too long (max ${MAX_CONTEXT_LENGTH} chars)` });
    return;
  }
  if (jobDescription && typeof jobDescription === "string" && jobDescription.length > MAX_CONTEXT_LENGTH) {
    res.status(400).json({ error: `Job description too long (max ${MAX_CONTEXT_LENGTH} chars)` });
    return;
  }
```

Update the adapter call (line 127-135) to use the dynamic system prompt:

```typescript
    const tokenStream = adapter.stream({
      model: resolvedModel,
      apiKey: resolvedKey,
      messages: trimmed,
      systemPrompt: buildSystemPrompt(resume ?? undefined, jobDescription ?? undefined),
      maxTokens: 512,
      temperature: 0.4,
      signal: abortController.signal,
    });
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat: dynamic system prompt with resume/JD context injection"
```

---

## Chunk 2: UI Components (FileUploader, ContextPanel, Settings, Sidebar, App)

### Task 6: Install `pdfjs-dist` and Create `FileUploader` Component

**Files:**
- Create: `src/components/FileUploader.tsx`

- [ ] **Step 1: Install pdfjs-dist**

```bash
npm install pdfjs-dist
```

- [ ] **Step 2: Create `FileUploader.tsx`**

```typescript
import { useRef, useState } from "react";

const MAX_FILE_SIZE = 1_000_000; // 1MB

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" "));
  }

  return pages.join("\n\n");
}

async function extractText(file: File): Promise<string> {
  if (file.name.endsWith(".pdf")) {
    return extractPdfText(file);
  }
  return file.text();
}

interface Props {
  onExtracted: (text: string, fileName: string) => void;
  label?: string;
}

export default function FileUploader({ onExtracted, label = "Upload PDF/TXT" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setError("");

    if (file.size > MAX_FILE_SIZE) {
      setError("File must be under 1MB");
      return;
    }

    setLoading(true);
    try {
      const text = await extractText(file);
      if (!text.trim()) {
        setError("Couldn't extract text from this file. Try pasting the content instead.");
        return;
      }
      onExtracted(text, file.name);
    } catch {
      setError("Couldn't extract text from this PDF. Try pasting the content instead.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        style={styles.uploadButton}
      >
        {loading ? "Extracting..." : label}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  uploadButton: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px dashed #475569",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: "0.75rem",
    cursor: "pointer",
    width: "100%",
    marginTop: 4,
  },
  error: {
    color: "var(--danger)",
    fontSize: "0.7rem",
    marginTop: 4,
  },
};
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/FileUploader.tsx package.json package-lock.json
git commit -m "feat: add FileUploader component with PDF/TXT text extraction"
```

---

### Task 7: Create `ContextPanel` Component

**Files:**
- Create: `src/components/ContextPanel.tsx`

- [ ] **Step 1: Create `ContextPanel.tsx`**

```typescript
import type { ResumeData } from "../types";
import FileUploader from "./FileUploader";

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
      />
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
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ContextPanel.tsx
git commit -m "feat: add ContextPanel component with JD input and resume status"
```

---

### Task 8: Extend `Settings` with Resume Section

**Files:**
- Modify: `src/components/Settings.tsx:4-9,18-88`

- [ ] **Step 1: Add resume props and section to Settings**

Update the `Props` interface (line 4-9):

```typescript
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
```

Update the component to accept the new props (line 18-23):

```typescript
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
```

Add the resume section after the disclaimer `<p>` tag (before the closing `</div>`, line 87). Add this import at the top: `import FileUploader from "./FileUploader";`

```tsx
      <div style={styles.divider} />

      <div style={styles.label}>Resume</div>
      <textarea
        value={resumeText}
        onChange={(e) => onResumeChange(e.target.value)}
        placeholder="Paste your resume here..."
        style={styles.resumeTextarea}
        rows={6}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (val) onResumeChange(val);
        }}
      />
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
```

- [ ] **Step 2: Add the `divider` and `resumeTextarea` styles**

Add to the styles object:

```typescript
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
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Errors in `Sidebar.tsx` because `Settings` now requires new props. This is expected — Task 9 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat: add resume management section to Settings"
```

---

### Task 9: Refactor `Sidebar` to Tabbed Layout

**Files:**
- Modify: `src/components/Sidebar.tsx:1-191`

- [ ] **Step 1: Rewrite `Sidebar.tsx` with tabs**

Replace the entire file. Key changes:
- Add `useState` import and tab state
- Add new props for context panel and resume
- Render tab bar + conditional tab content
- Reset tab to "chats" when `isOpen` changes from false to true (mobile)

```typescript
import { useState, useEffect } from "react";
import type { StoredChat, Provider, Settings as SettingsType, ResumeData } from "../types";
import SettingsPanel from "./Settings";
import ContextPanel from "./ContextPanel";

type Tab = "chats" | "context" | "settings";

interface Props {
  chats: StoredChat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType;
  onProviderChange: (provider: Provider) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (provider: Provider, key: string) => void;
  jobDescription: string;
  onJobDescriptionChange: (jd: string) => void;
  resume: ResumeData | null;
  onResumeChange: (text: string, fileName?: string) => void;
  onResumeClear: () => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  isOpen,
  onClose,
  settings,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  jobDescription,
  onJobDescriptionChange,
  resume,
  onResumeChange,
  onResumeClear,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("chats");

  // Reset to chats tab when mobile sidebar reopens
  useEffect(() => {
    if (isOpen) setActiveTab("chats");
  }, [isOpen]);

  const handleSelectChat = (id: string) => {
    onSelectChat(id);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  return (
    <>
      {isOpen && <div style={styles.backdrop} onClick={onClose} />}

      <aside
        className="sidebar-desktop"
        style={{
          ...styles.sidebar,
          ...(isOpen ? styles.sidebarOpen : {}),
        }}
      >
        <button className="sidebar-close-button" style={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <button style={styles.newChatButton} onClick={handleNewChat}>
          + New Chat
        </button>

        {/* Tab bar */}
        <div style={styles.tabBar}>
          {(["chats", "context", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={styles.tabContent}>
          {activeTab === "chats" && (
            <div style={styles.chatList}>
              {chats.length === 0 && (
                <p style={styles.emptyChatText}>No chats yet</p>
              )}
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  style={{
                    ...styles.chatItem,
                    ...(chat.id === activeChatId ? styles.chatItemActive : {}),
                  }}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}

          {activeTab === "context" && (
            <ContextPanel
              jobDescription={jobDescription}
              onJobDescriptionChange={onJobDescriptionChange}
              resume={resume}
              onSwitchToSettings={() => setActiveTab("settings")}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              settings={settings}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
              onApiKeyChange={onApiKeyChange}
              resumeText={resume?.text ?? ""}
              resumeFileName={resume?.fileName}
              onResumeChange={onResumeChange}
              onResumeClear={onResumeClear}
            />
          )}
        </div>
      </aside>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 90,
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    background: "var(--bg)",
    borderRight: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
    padding: 16,
    zIndex: 100,
    transform: "translateX(-100%)",
    transition: "transform 0.2s ease",
    overflowY: "auto",
  },
  sidebarOpen: {
    transform: "translateX(0)",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: 4,
    display: "block",
  },
  newChatButton: {
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
    width: "100%",
    marginBottom: 12,
    marginTop: 24,
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #334155",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#64748b",
    fontSize: "0.7rem",
    fontWeight: 500,
    padding: "8px 4px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tabActive: {
    color: "#38bdf8",
    borderBottomColor: "#38bdf8",
  },
  tabContent: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  },
  chatList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  chatItem: {
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text-muted)",
    fontSize: "0.8rem",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexShrink: 0,
  },
  chatItemActive: {
    background: "var(--bg-surface)",
    color: "var(--text)",
    borderLeft: "3px solid var(--accent)",
  },
  emptyChatText: {
    color: "var(--text-muted)",
    fontSize: "0.75rem",
    fontStyle: "italic",
    padding: "8px 10px",
  },
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Errors in `App.tsx` because `Sidebar` now requires new props. This is expected — Task 10 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: refactor Sidebar to tabbed layout (Chats/Context/Settings)"
```

---

### Task 10: Wire Everything in `App.tsx`

**Files:**
- Modify: `src/App.tsx:1-277`

- [ ] **Step 1: Add imports and state for resume and JD**

Add to imports (line 6-7):

```typescript
import { useResume } from "./hooks/useResume";
```

Add state inside the component (after line 17):

```typescript
  const [jobDescription, setJobDescription] = useState("");
  const { resume, setResume, clearResume } = useResume();
```

- [ ] **Step 2: Update `handleQuestion` to pass context to API**

In `handleQuestion` (line 74-80), update the `streamAnswer` call:

```typescript
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
```

- [ ] **Step 3: Update `saveChat` calls to include JD**

In `handleQuestion` (line 101), pass JD:

```typescript
        const chatId = saveChat(activeChatIdRef.current, finalMessages, jobDescription || undefined);
```

In `handleNewChat` (line 131), pass JD when saving current chat:

```typescript
      saveChat(activeChatIdRef.current, messages, jobDescription || undefined);
```

- [ ] **Step 4: Update `handleSelectChat` to restore JD**

```typescript
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
```

- [ ] **Step 5: Update `handleNewChat` to clear JD**

Add `setJobDescription("");` inside `handleNewChat`:

```typescript
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
  }, [messages, jobDescription, saveChat, startNewChat]);
```

- [ ] **Step 6: Add JD debounce auto-save**

The spec requires JD to auto-save via debounce (500ms). Add a `useEffect` that persists JD to the active chat whenever it changes:

```typescript
  // Auto-save JD to active chat with debounce
  useEffect(() => {
    if (!activeChatIdRef.current || messages.length === 0) return;
    const timer = setTimeout(() => {
      saveChat(activeChatIdRef.current!, messages, jobDescription || undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [jobDescription, messages, saveChat]);
```

Place this after the existing `activeChatIdRef` sync effect (around line 28).

- [ ] **Step 7: Pass new props to `Sidebar`**

Update the `<Sidebar>` JSX (line 143-154):

```tsx
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
```

- [ ] **Step 8: Add context status badges in the header**

Update the header JSX (line 157-167):

```tsx
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
            {jobDescription && <span style={styles.badge}>JD active</span>}
            {resume && <span style={styles.badge}>Resume active</span>}
          </div>
        </header>
```

- [ ] **Step 9: Add badge styles**

Add to the styles object:

```typescript
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
    whiteSpace: "nowrap",
  },
```

- [ ] **Step 10: Verify full build**

Run: `npx tsc --noEmit && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire context state through App — JD, resume, badges, debounce"
```

---

### Task 11: Manual Verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify tabbed sidebar**

Open http://localhost:5173. Verify:
- Sidebar shows 3 tabs: Chats, Context, Settings
- Clicking tabs switches content
- Chats tab shows existing behavior (new chat button, chat list)

- [ ] **Step 3: Verify resume in Settings**

- Switch to Settings tab
- Paste text into the resume textarea
- Verify it persists after page reload
- Clear the resume, verify it's gone

- [ ] **Step 4: Verify JD in Context tab**

- Switch to Context tab
- Paste a job description
- Send a question via voice/text
- Verify the AI response references the JD content
- Switch to a different chat and back — verify JD is restored

- [ ] **Step 5: Verify file upload**

- Click "Upload PDF/TXT" in the Context tab
- Upload a .txt file — verify text populates the textarea
- Upload a .pdf file — verify text is extracted and shown
- Try a file > 1MB — verify error message

- [ ] **Step 6: Verify context badges**

- With both JD and resume set, verify both badges appear in the header
- Clear JD — verify only "Resume active" badge shows
- Clear resume — verify no badges show

- [ ] **Step 7: Verify mobile layout**

- Resize browser to < 768px
- Open hamburger menu
- Verify tabs work in the overlay sidebar
- Close and reopen — verify it resets to Chats tab

- [ ] **Step 8: Final commit**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
