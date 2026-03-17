# Context Feature: Job Description & Resume Integration

**Date:** 2026-03-16
**Status:** Draft

## Overview

Add the ability to provide interview context (job description and resume) so AI responses are tailored to the specific role and the user's background. Resume is set once globally; job description is set per chat session.

## Data Model & Storage

### Resume (Global)

- **Storage:** localStorage key `"interview-helper-resume"`
- **Shape:**
  ```typescript
  interface ResumeData {
    text: string;
    fileName?: string;
    updatedAt: number;
  }
  ```
- Persists across all chats
- Managed in Settings tab via new `useResume` hook (follows `useSettings` pattern)

### Job Description (Per-Chat)

- **Storage:** Extends existing chat object in `useChats` hook
- **Shape change:** Add `jobDescription?: string` field to the `Chat` interface in `types.ts`
- **Save trigger:** Auto-saved via debounce (500ms) to the active chat object. `saveChat` signature extends to `(id, messages, jobDescription?)`. When `jobDescription` is provided, it's persisted alongside messages.
- **Load behavior:** `loadChat` returns the chat's `jobDescription` along with messages. `App.tsx` sets local JD state from the loaded chat.
- Cleared on "New Chat" (user pastes fresh JD)

### API Transport

Both fields sent as optional strings in the POST to `/api/answer`.

**Client-side:** Add `resume?: string` and `jobDescription?: string` to the `StreamAnswerParams` interface in `src/api/getAnswer.ts`.

**Server-side:** Add `resume?: string` and `jobDescription?: string` to the `AnswerRequest` interface in `server/types.ts`.

```typescript
// Extended request body (both client and server types)
{
  messages: ChatMessage[];
  provider: string;
  model: string;
  apiKey?: string;
  resume?: string;        // new
  jobDescription?: string; // new
}
```

## UI Design

### Tabbed Sidebar

Replace current sidebar layout with a 3-tab navigation:

**Tab bar:**
- Tabs: **Chats** | **Context** | **Settings**
- Active tab: `#38bdf8` underline indicator
- Inactive tabs: `#64748b` text
- Default on app load: **Chats**
- Tab state: managed as local state in `Sidebar.tsx`. Reset to "Chats" when `sidebarOpen` transitions from `false` to `true` (mobile close/reopen).

**Chats tab:**
- Identical to current sidebar content
- "New Chat" button + recent chats list
- No changes to existing behavior

**Context tab (new):**
- **Job Description section:**
  - Label: "Job Description"
  - Resizable textarea (~4-6 visible lines)
  - "Upload PDF/TXT" button below textarea
  - "Clear" button when content present
  - Per-chat: switching chats loads that chat's JD
- **Resume status section (read-only):**
  - Shows: "No resume set" or "Resume loaded (updated {date})"
  - "Edit in Settings →" link switches to Settings tab
  - Not editable here — resume is global, managed in Settings

**Settings tab (extended):**
- Existing fields unchanged: provider, model, API key
- New section at bottom: **Resume**
  - Textarea for paste
  - "Upload PDF/TXT" button
  - "Clear" button when content present
  - Auto-saves on blur / debounce

### Context Status Badges

- Small badges displayed to the right of the header title in the chat area
- Shows `📄 JD active` and/or `📋 Resume active` when respective context is present
- Informational only — not clickable
- Provides at-a-glance confirmation context is being used

### Mobile Behavior

- Tabs work identically in the hamburger overlay sidebar
- Tab state persists while sidebar is open
- Resets to Chats tab when sidebar closes

## File Upload & Text Extraction

### Supported Formats
- **PDF:** Client-side extraction via `pdfjs-dist` (Mozilla's PDF parser). Use dynamic `import()` to lazy-load — the library is ~400KB+ and should not be in the main bundle for a mobile-first app.
- **TXT:** Read with `FileReader` API
- **DOCX:** Not supported in v1 (significant complexity)

### Upload Flow
1. User clicks "Upload PDF/TXT"
2. Native file picker opens (accepts `.pdf, .txt`)
3. File read client-side, text extracted
4. Extracted text populates textarea for review/editing
5. `fileName` stored for display

### Constraints
- File size limit: 1MB
- Text stored, file blob discarded after extraction

### Error Handling
- Unreadable PDF: "Couldn't extract text from this PDF. Try pasting the content instead."
- File too large: "File must be under 1MB"
- Wrong format: file picker restricts + validation fallback

## Backend Changes

### Request Validation
- `resume`: optional string, max 10,000 characters
- `jobDescription`: optional string, max 10,000 characters
- Body size limit: `"50kb"` → `"100kb"` (Express notation)

**Context window note:** With max 20K chars of context (~5K tokens) added to the system prompt, this stays well within all supported models' context windows (smallest is gpt-4o-mini at 128K). The response `maxTokens` (512) remains unchanged — it controls output length, not input capacity.

### System Prompt Construction

Base system prompt remains unchanged. Context appended when present:

```
{base system prompt}

Here is the user's resume for reference:
---
{resume}
---

Here is the job description the user is interviewing for:
---
{jobDescription}
---

Use this context to tailor your responses. Reference specific experience from the resume and align answers with the job requirements.
```

Sections only included when their respective content is provided.

### No Adapter Changes
- All adapters (OpenAI, Anthropic, Google) already receive `systemPrompt` as a parameter
- Rate limiting, CORS, concurrency throttle unchanged

## Components Summary

| Component | Change Type | Description |
|-----------|-------------|-------------|
| `Sidebar.tsx` | Major refactor | Add tab navigation, render tab content conditionally |
| `ContextPanel.tsx` | New component | JD textarea, upload button, resume status display |
| `Settings.tsx` | Extend | Add resume management section |
| `useResume.ts` | New hook | localStorage-backed resume persistence |
| `useChats.ts` | Extend | Add `jobDescription` field to chat type |
| `App.tsx` | Extend | Pass resume/JD to API call, render context badges |
| `getAnswer.ts` | Extend | Include resume/JD in request body |
| `server/index.ts` | Extend | Accept new fields, construct dynamic system prompt |
| `types.ts` | Extend | Add new type fields |
| `FileUploader.tsx` | New component | PDF/TXT upload + extraction logic |

## Out of Scope
- DOCX file support
- Multiple saved resume profiles
- Company research notes or other context types
- Server-side storage of context
- Context search or history
