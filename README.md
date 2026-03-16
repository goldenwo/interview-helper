# Interview Helper

A mobile-first PWA that listens to interview questions via your phone's microphone and instantly displays AI-generated answers in large, easy-to-read text.

## How it works

1. Open the app on your phone (Chrome on Android recommended).
2. Tap the mic button — the app uses the Web Speech API to transcribe what the interviewer says.
3. Tap **Send** (or stop the mic) to submit the transcribed question.
4. The question is sent to a lightweight Express backend that calls the OpenAI API.
5. The answer appears on screen in large text so you can glance at it quickly.

## Tech stack

| Layer    | Choice                 |
| -------- | ---------------------- |
| Frontend | React 19 + Vite 6     |
| PWA      | vite-plugin-pwa        |
| Speech   | Web Speech API         |
| Backend  | Node / Express 5       |
| AI       | OpenAI (gpt-4o-mini)   |

## Getting started

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

```bash
git clone https://github.com/goldenwo/interview-helper.git
cd interview-helper
npm install
```

Create a `.env` file from the template and add your key:

```bash
cp env.example .env
# then edit .env and paste your OpenAI API key
```

### Run locally

```bash
npm run dev
```

This starts both the Vite dev server (frontend) and the Express backend concurrently. The frontend proxies `/api` requests to the backend on port 3001.

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Use on your phone (same network)

When you run `npm run dev`, Vite prints a **Network** URL (e.g. `http://192.168.x.x:5173`). Open that URL on your phone's browser (Chrome on Android for best results). You can tap "Add to Home Screen" in Chrome's menu to install it as a PWA.

> **Note:** Speech recognition requires HTTPS in production. On your local network over HTTP, Chrome on Android typically still allows mic access. For a deployed version, use a service like Vercel or Netlify with HTTPS.

## Environment variables

| Variable         | Description          |
| ---------------- | -------------------- |
| `OPENAI_API_KEY` | Your OpenAI API key  |
| `PORT`           | Backend port (default: 3001) |

## Project structure

```
interview-helper/
  index.html              Entry HTML
  vite.config.ts          Vite + PWA config
  package.json
  env.example             Template for .env
  server/
    index.ts              Express backend (POST /api/answer -> OpenAI)
  src/
    main.tsx              React entry
    App.tsx               Root component (state management)
    index.css             Global styles
    api/
      getAnswer.ts        Frontend fetch helper
    components/
      Recorder.tsx        Mic button + Web Speech API
      AnswerDisplay.tsx   Large-text answer display
```

## Browser support

- **Chrome on Android**: Full support (Web Speech API + PWA install).
- **Safari on iOS**: Web Speech API has limited support. Consider using Chrome on iOS or a future native wrapper.
- **Desktop Chrome**: Works for testing.

## License

MIT
