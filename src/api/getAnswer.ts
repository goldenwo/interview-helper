export async function getAnswer(question: string): Promise<string> {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Server error ${res.status}`);
  }

  const data = await res.json();
  return data.answer;
}
