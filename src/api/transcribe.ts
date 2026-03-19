export async function transcribeAudio(
  audioBlob: Blob,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append("audio", audioBlob, "recording");
  if (apiKey) form.append("apiKey", apiKey);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
    signal,
  });

  if (!res.ok) {
    let message = `Server error ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // response wasn't JSON
    }
    throw new Error(message);
  }

  const body = await res.json();
  return body.text;
}
