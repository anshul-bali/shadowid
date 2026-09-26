// Ordered fallback chain. Prefer models with remaining free-tier quota on the
// configured key; older/alias models here may be quota-exhausted (429) or
// unavailable to the account (404), so keep several working alternatives.
import { generateJson as generateFallbackJson } from "./deepseek";

const MODELS = [
  ...new Set([
    process.env.GOOGLE_AI_MODEL || "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ]),
];
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GoogleAIError extends Error {}

interface Part {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
}

async function generate(
  systemInstruction: string,
  userText: string,
  image?: { base64: string; mimeType: string },
  jsonMode = true
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new GoogleAIError("GOOGLE_AI_API_KEY is not configured on the server");

  const parts: Part[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  parts.push({ text: userText });

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts }],
    ...(jsonMode
      ? { generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }
      : { generationConfig: { temperature: 0.4 } }),
  });

  let lastError = "";
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = `Google AI request failed on ${model} (HTTP ${res.status}): ${body.slice(0, 300)}`;
        // 404: model unavailable -> try next model; 429/503: overload -> retry then next model
        if (res.status === 404) break;
        if (res.status === 429 || res.status === 503) continue;
        throw new GoogleAIError(lastError);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: Part[] } }[];
      };
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("");
      if (!text) throw new GoogleAIError("Google AI returned an empty response");
      return text;
    }
  }
  throw new GoogleAIError(lastError || "Google AI request failed after retries");
}

export async function generateJson<T>(systemInstruction: string, userText: string): Promise<T> {
  try {
    const text = await generate(systemInstruction, userText);
    try {
      return JSON.parse(text) as T;
    } catch {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) throw new GoogleAIError("Google AI response was not valid JSON");
      return JSON.parse(match[0]) as T;
    }
  } catch {
    // Google AI quota/failure (e.g. HTTP 429) -> fall back to DeepSeek, which
    // itself falls back to Groq, so research/match text generation never
    // hard-fails on a single provider's quota.
    return generateFallbackJson<T>(systemInstruction, userText);
  }
}

export async function generateVisionJson<T>(
  systemInstruction: string,
  userText: string,
  imageBase64: string,
  mimeType: string
): Promise<T> {
  const text = await generate(systemInstruction, userText, {
    base64: imageBase64,
    mimeType,
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new GoogleAIError("Google AI vision response was not valid JSON");
    return JSON.parse(match[0]) as T;
  }
}
