type Category = "technical" | "behavioral" | "general";

const PHRASES: Record<Category, string[]> = {
  technical: [
    "That's a good question — let me walk through my thinking on that...",
    "Sure, let me break down how I'd approach that...",
    "Great question — let me think through the key considerations...",
  ],
  behavioral: [
    "Sure, let me think of a good example...",
    "That's a great question — I have a relevant experience in mind...",
    "Let me think about the best example for that...",
  ],
  general: [
    "Great question, let me gather my thoughts...",
    "That's an interesting question — give me a moment to think...",
    "Sure, let me think about that for a second...",
  ],
};

const TECHNICAL_KEYWORDS = [
  "implement", "design", "build", "algorithm", "system",
  "architect", "scale", "database", "api", "code",
  "function", "class", "data structure", "complexity",
  "optimize", "debug", "deploy", "infrastructure",
];

const BEHAVIORAL_KEYWORDS = [
  "tell me about a time", "describe a situation", "example of",
  "give me an example", "how did you handle", "what would you do",
  "conflict", "challenge", "difficult", "leadership",
  "teamwork", "mistake", "failure", "proud",
];

const lastUsed: Record<Category, number> = {
  technical: -1,
  behavioral: -1,
  general: -1,
};

function categorize(question: string): Category {
  const lower = question.toLowerCase();
  if (BEHAVIORAL_KEYWORDS.some((kw) => lower.includes(kw))) return "behavioral";
  if (TECHNICAL_KEYWORDS.some((kw) => lower.includes(kw))) return "technical";
  return "general";
}

export function getStallPhrase(question: string): string {
  const category = categorize(question);
  const phrases = PHRASES[category];
  // Rotate: pick next phrase, wrapping around
  let index = (lastUsed[category] + 1) % phrases.length;
  lastUsed[category] = index;
  return phrases[index];
}
