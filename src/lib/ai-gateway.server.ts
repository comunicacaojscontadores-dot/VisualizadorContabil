import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createGemini() {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) throw new Error("GOOGLE_AI_KEY ausente");
  return createGoogleGenerativeAI({ apiKey: key });
}
