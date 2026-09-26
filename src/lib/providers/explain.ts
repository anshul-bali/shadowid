// Explanation provider: prefers OpenAI, falls back to Google AI (Gemini) when
// OpenAI is unavailable (e.g. no credits). Explanations are human-readable text
// about already-computed, evidence-backed facts — the AI never invents findings
// or scores, it only phrases them.
import { generateJson as generateOpenAI } from "./openai";
import { generateJson as generateGemini } from "./google-ai";

export async function explainJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  try {
    return await generateOpenAI<T>(systemPrompt, userPrompt);
  } catch {
    return await generateGemini<T>(systemPrompt, userPrompt);
  }
}
