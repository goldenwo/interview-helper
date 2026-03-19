import OpenAI, { toFile } from "openai";

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

export async function transcribe(
  audioBuffer: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const ext = MIME_TO_EXT[mimeType.split(";")[0]] ?? "webm";
  const fileName = `recording.${ext}`;

  console.log(`[whisper] Request received — ${audioBuffer.byteLength} bytes, ${mimeType}`);
  const start = Date.now();

  const client = new OpenAI({ apiKey });

  const file = await toFile(audioBuffer, fileName, { type: mimeType });

  const result = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
  });

  const elapsed = Date.now() - start;
  console.log(`[whisper] Transcription complete — ${elapsed}ms, ${result.text.length} chars`);

  return result.text;
}
