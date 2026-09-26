import { explainJson } from "../providers/explain";
import type { FindingRow, RecommendedAction, ScoreBreakdown } from "../types";

export interface ReportAgentOutput {
  summary: string;
  narrative: string;
  recommended_actions: RecommendedAction[];
}

const SYSTEM = `You are the Report Agent for ShadowID, an authorized identity-exposure review tool. The subject consented to the scan of their own public footprint.
You receive structured findings produced by other agents (each citing saved evidence) and a deterministic Shadow Score breakdown computed by auditable server code. You do NOT compute the score.
Write for a non-expert:
- summary: 1-2 sentences on the overall exposure picture.
- narrative: 2-4 short paragraphs explaining the supported risks, what evidence backs them, and what remains uncertain. Reference evidence by title/URL. Never claim certainty where findings are marked needs_review. Impersonation is always "possible, pending human review".
- recommended_actions: 3-6 concrete, prioritized actions the person can take.
Be factual and calm. Do not invent findings, evidence, or scores.`;

export async function runReportAgent(
  scoreBreakdown: ScoreBreakdown,
  shadowScore: number,
  findings: FindingRow[],
  uncertaintyNotes: string
): Promise<ReportAgentOutput> {
  const compact = findings.slice(0, 30).map((f) => ({
    agent: f.agent,
    type: f.finding_type,
    title: f.title,
    description: f.description,
    severity: f.severity,
    confidence: f.confidence,
    needs_review: f.needs_review,
    evidence_count: f.evidence_ids.length,
  }));

  const prompt = `Shadow Score (experimental, computed by server code): ${shadowScore}/100\nScore breakdown: ${JSON.stringify(scoreBreakdown)}\nUncertainty notes: ${uncertaintyNotes}\nFindings:\n${JSON.stringify(compact, null, 2)}\n\nReturn JSON: {"summary": string, "narrative": string, "recommended_actions": [{"title": string, "detail": string, "priority": "low"|"medium"|"high"|"critical"}]}`;

  // explainJson prefers the OpenAI-compatible provider (Groq) and falls back to
  // Gemini, so the narrative is written from real findings even if one is down.
  const result = await explainJson<ReportAgentOutput>(SYSTEM, prompt);

  return {
    summary: String(result.summary ?? "").slice(0, 500) || "Scan completed; see findings below.",
    narrative: String(result.narrative ?? "").slice(0, 6000),
    recommended_actions: (result.recommended_actions ?? [])
      .slice(0, 6)
      .map((a) => ({
        title: String(a.title ?? "").slice(0, 200),
        detail: String(a.detail ?? "").slice(0, 600),
        priority: (["low", "medium", "high", "critical"] as const).includes(a.priority)
          ? a.priority
          : "medium",
      })),
  };
}
