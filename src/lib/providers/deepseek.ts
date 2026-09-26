import { generateJsonCompat, generateJson as generateGroq, type CompatConfig } from "./openai";

// DeepSeek speaks the OpenAI chat completions API. It sits between Google AI and
// Groq in the text-generation fallback chain. No vision model is used here, so
// document OCR/vision stays on Google AI.
const DEEPSEEK_CONFIG: CompatConfig = {
  name: "DeepSeek",
  baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY,
  models: [
    ...new Set([process.env.DEEPSEEK_MODEL || "deepseek-chat", "deepseek-chat"]),
  ],
};

export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  try {
    return await generateJsonCompat<T>(systemPrompt, userPrompt, DEEPSEEK_CONFIG);
  } catch {
    // DeepSeek unavailable/out of credit -> final fallback to Groq.
    return generateGroq<T>(systemPrompt, userPrompt);
  }
}
