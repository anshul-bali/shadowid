export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

const MAX_RESULTS = 5;

export async function tavilySearch(
  query: string,
  maxResults = MAX_RESULTS
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured on the server");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(maxResults, MAX_RESULTS),
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = `Tavily search failed (HTTP ${res.status}): ${body.slice(0, 200)}`;
      if (res.status === 429 || res.status === 503) continue;
      throw new Error(lastError);
    }

    const data = (await res.json()) as { results?: TavilyResult[] };
    return (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title || r.url,
      content: (r.content || "").slice(0, 1200),
      score: typeof r.score === "number" ? r.score : 0,
    }));
  }
  throw new Error(lastError || "Tavily search failed after retries");
}
