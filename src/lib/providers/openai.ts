import OpenAI from "openai";

export class OpenAIProviderError extends Error {}

// Generic OpenAI-compatible caller. Any provider that speaks the OpenAI chat
// completions API (Groq, DeepSeek, OpenAI, ...) can be driven through this by
// passing its base URL, key and model chain.
export interface CompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  models: string[];
  temperature?: number;
  maxTokens?: number;
}

function parseJson<T>(text: string, name: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new OpenAIProviderError(`${name} response was not valid JSON`);
    return JSON.parse(match[0]) as T;
  }
}

export async function generateJsonCompat<T>(
  systemPrompt: string,
  userPrompt: string,
  config: CompatConfig
): Promise<T> {
  if (!config.apiKey) {
    throw new OpenAIProviderError(`${config.name} API key is not configured on the server`);
  }
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 60_000,
    maxRetries: 1,
  });
  let lastError = "";
  for (const model of config.models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: config.temperature ?? 0.3,
        max_tokens: config.maxTokens ?? 4000,
      });
      const text = completion.choices[0]?.message?.content;
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }
      return parseJson<T>(text, config.name);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Model unavailable or rejected params -> try the next model in the chain.
      continue;
    }
  }
  throw new OpenAIProviderError(
    `${config.name} request failed: ${lastError}`.slice(0, 500)
  );
}

// The "OpenAI" slot is endpoint-configurable and currently pointed at Groq
// (see .env.local). Groq also serves as the final universal text fallback.
const GROQ_CONFIG: CompatConfig = {
  name: "Groq",
  baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY,
  models: [
    ...new Set([
      process.env.OPENAI_MODEL || "gpt-4o-mini",
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-20b",
    ]),
  ],
};

export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  return generateJsonCompat<T>(systemPrompt, userPrompt, GROQ_CONFIG);
}
