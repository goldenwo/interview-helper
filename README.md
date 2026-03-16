# Interview Helper

A mobile-first PWA that listens to interview questions via your phone's microphone, sends them to an AI, and displays the answer in large, easy-to-read text.

## How it works

1. Open the app on your phone (Chrome on Android recommended).
2. Tap **Start Listening** — the app uses the Web Speech API to transcribe what the interviewer says.
3. The transcribed question is sent to a lightweight backend that calls the OpenAI API.
4. The answer appears on screen in large text so you can glance at it quickly.

## Tech stack

- **Frontend**: React + Vite, installable as a PWA
- **Speech**: Web Speech API (built into the browser)
- **Backend**: Node / Express API that proxies requests to OpenAI
- **AI**: OpenAI Chat Completions API

## Getting started

```bash
# Install dependencies
npm install

# Copy env template and add your OpenAI key
cp env.example .env

# Run dev server (frontend + backend)
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key |

## License

MIT
