# Whisper-Based Recorder — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Problem

iOS Safari's `webkitSpeechRecognition` plays audible system beeps on every `recognition.start()` and `recognition.stop()`. These cannot be suppressed via JavaScript. The current Recorder also requires extensive iOS-specific workarounds (one-shot mode, warmup timeouts, visibility change handlers, retry logic) due to the unreliability of the Web Speech API on iOS Safari.

## Solution

Replace the Web Speech API with `getUserMedia` + `MediaRecorder` for silent audio capture, and OpenAI's Whisper API (`whisper-1`) for transcription. This eliminates all iOS beeps and all iOS-specific workarounds.

## Decisions

- **Full replacement** — Whisper replaces Web Speech API on all platforms (not just iOS). Simpler code, consistent experience. Cost is negligible (~$0.001-0.003 per recording).
- **Server-side proxy** — Audio is sent to a new `/api/transcribe` Express endpoint, which forwards to OpenAI. Keeps API keys server-side, matches existing `/api/answer` architecture.
- **Manual stop + 60s safety cap** — User taps to start/stop. Auto-stops at 60 seconds to prevent accidental large recordings.

## Backend: `/api/transcribe` endpoint

### New file: `server/adapters/whisper.ts`
- Accepts an audio `Buffer`, MIME type, and optional API key
- Resolves API key: provided key → `OPENAI_API_KEY` env var
- Calls `openai.audio.transcriptions.create()` with model `whisper-1`, language `en`
- Returns transcribed text string
- Logs: request received (file size), API call latency, success/failure
- Note: This adapter does NOT implement `ProviderAdapter` — Whisper is a transcription API, not a chat completion API. It is placed in `adapters/` for organizational consistency.

### Route in `server/index.ts`
- `POST /api/transcribe`
- Multipart form-data parsing using `multer` (Express 5 has no built-in multipart support)
- Fields: `audio` (file), `apiKey` (optional string)
- File size cap: 5MB via multer limits
- Validate uploaded file MIME type is `audio/*` before forwarding to Whisper
- Subject to existing rate limiter (shared budget is acceptable — users record infrequently relative to answer requests)
- Response: `{ text: string }` on success, `{ error: string }` on failure
- Logs: request IP (consistent with existing logging), file size, MIME type, processing time

## Frontend: Recorder rewrite

### Remove entirely
- `SpeechRecognitionCtor`, `isIOS` detection
- `audioStartedRef`, `retryCountRef`, `warmupTimeoutRef`, `transcriptRef`
- `clearWarmupTimeout()` function
- All `recognition.*` event handlers and lifecycle code
- `webkitSpeechRecognition` type references
- Visibility change handler for zombie session cleanup

### Supported check
- Replace the `SpeechRecognition` support check with a `navigator.mediaDevices?.getUserMedia` check
- Show equivalent "not supported" message if absent (covers extremely old browsers or non-HTTPS contexts)
- Note: `getUserMedia` requires a secure context (HTTPS or localhost). Local dev via `vite --host` over LAN requires HTTPS.

### MIME type negotiation
- Prefer `audio/webm;codecs=opus` via `MediaRecorder.isTypeSupported()`
- Fallback to `audio/mp4` (iOS Safari's default — does not support webm)
- Both formats are accepted by the Whisper API (it supports webm, mp4, mp3, wav, m4a, mpeg, mpga)

### New recording flow
1. User taps mic → `navigator.mediaDevices.getUserMedia({ audio: true })` (silent, no beeps)
2. Create `MediaRecorder` with negotiated MIME type
3. Collect chunks via `ondataavailable`
4. User taps stop (or 60s cap auto-triggers stop) → `mediaRecorder.stop()`
5. **Stop all `MediaStream` tracks** (`stream.getTracks().forEach(t => t.stop())`) to release the microphone
6. Assemble chunks into `Blob`, POST to `/api/transcribe` via `FormData`
7. Display returned text in transcript box
8. Send/Clear buttons behave identically to current implementation

### Cleanup on unmount
- Stop `MediaRecorder` if recording
- Stop all `MediaStream` tracks to release mic
- Clear the 60s safety cap timer

### Visibility change handling
- If the page is backgrounded mid-recording: auto-stop recording and proceed to transcription (iOS suspends the mic when backgrounded, so continuing would produce silence)

### State
- `recording` (boolean) — replaces `listening`
- `transcribing` (boolean) — new, true while waiting for Whisper response
- `transcript` (string) — unchanged
- `error` (string) — unchanged

### UX during transcription
- Mic button disabled while transcribing
- Hint text shows "Transcribing..."
- On failure: show error message, allow retry

### Recording duration indicator
- Show elapsed seconds while recording so the user is aware of the 60s cap

### Client-side logging
- Log recording start, stop (with blob size in bytes, MIME type)
- Log transcription request sent, response received (with latency in ms)
- Log errors with full context

## New file: `src/api/transcribe.ts`
- Dedicated API function following the pattern of `src/api/getAnswer.ts`
- Accepts `Blob` and optional `apiKey`
- Builds `FormData`, POSTs to `/api/transcribe`
- Returns `{ text: string }` or throws with error message
- Keeps fetch logic out of the Recorder component

## Props change

```typescript
interface Props {
  onQuestion: (question: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
  apiKey?: string;  // NEW — OpenAI key for Whisper transcription
}
```

`App.tsx` passes `settings.apiKeys.openai` to Recorder as the `apiKey` prop. Whisper always requires an OpenAI key regardless of which provider is selected for chat completions.

## API key resolution

Unlike `/api/answer` which resolves keys based on the selected provider, `/api/transcribe` always resolves as OpenAI:
1. Check `apiKey` field in form data (user-provided OpenAI key from Settings)
2. Fall back to `OPENAI_API_KEY` environment variable
3. Return 400 with message: "An OpenAI API key is required for transcription. Add one in Settings or set OPENAI_API_KEY on the server."

## Error handling

| Scenario | Behavior |
|----------|----------|
| No mic permission | Show "Microphone permission denied" error |
| `getUserMedia` not supported | Show "not supported" fallback message |
| No API key available | 400 from server → show descriptive error about needing OpenAI key |
| Whisper API failure | Show "Transcription failed. Tap the mic to try again." |
| Network error | Show "Network error" message |
| Invalid MIME type | 400 from server → show error |
| File too large (>5MB) | 413 from server → show error |
| 60s cap reached | Auto-stop recording, proceed to transcription |
| Page backgrounded mid-recording | Auto-stop recording, proceed to transcription |

## Dependencies

- `multer` — new **production** dependency for multipart form-data parsing
- `@types/multer` — new dev dependency
- `openai` — already installed

## Files changed

- `server/adapters/whisper.ts` — new (Whisper transcription adapter)
- `server/index.ts` — add `/api/transcribe` route, multer setup
- `src/api/transcribe.ts` — new (frontend API function)
- `src/components/Recorder.tsx` — full rewrite
- `src/App.tsx` — pass `apiKey` prop to Recorder
- `package.json` — add `multer`, `@types/multer`
