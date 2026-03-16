import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert interview coach. The user will give you an interview question they were just asked. Respond with a clear, concise, well-structured answer they can glance at on their phone. Keep it short — ideally 2-4 sentences — unless the question demands more detail. Use plain language, no markdown.`;

app.post("/api/answer", async (req, res) => {
  const { question } = req.body as { question?: string };

  if (!question?.trim()) {
    res.status(400).json({ error: "Missing question" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      max_tokens: 512,
      temperature: 0.4,
    });

    const answer = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ answer });
  } catch (err: unknown) {
    console.error("OpenAI error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to get answer";
    res.status(502).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
