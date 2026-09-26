import { generateJson } from "../providers/google-ai";
import type { EvidenceRow, ScanRow, Severity } from "../types";

export interface ResearchFinding {
  finding_type: "exposure" | "identity_signal";
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  needs_review: boolean;
  evidence_ids: string[];
}

const SYSTEM = `You are the Research Agent for ShadowID, an authorized identity-exposure review tool.
You review public web pages retrieved for a person who submitted their OWN details and consented to the scan.
Rules:
- Only report signals that are supported by the provided evidence items. Every finding MUST cite at least one evidence id from the list.
- NEVER invent URLs, quotes, or facts. If the evidence is ambiguous or the person might be someone else with the same name, set needs_review=true and lower confidence.
- severity reflects exposure risk of the information found (public contact details, home city, employer, photos, accounts = higher).
- confidence is your 0..1 estimate that the signal genuinely refers to the submitted identity.
- Return at most 10 findings, most important first. If nothing relevant is found, return an empty list.`;

export async function runResearchAgent(
  scan: ScanRow,
  evidence: EvidenceRow[]
): Promise<ResearchFinding[]> {
  if (evidence.length === 0) return [];

  const identity = {
    name: scan.subject_name,
    handles: scan.handles,
    profile_links: scan.profile_links,
    context: scan.context,
  };

  const evidenceList = evidence.slice(0, 20).map((e) => ({
    id: e.id,
    url: e.url,
    title: e.title,
    excerpt: (e.excerpt ?? "").slice(0, 800),
    retrieved_at: e.retrieved_at,
  }));

  const result = await generateJson<{ findings: ResearchFinding[] }>(
    SYSTEM,
    `Submitted identity (self-declared, consented):\n${JSON.stringify(identity, null, 2)}\n\nEvidence items retrieved from public web search:\n${JSON.stringify(evidenceList, null, 2)}\n\nReturn JSON: {"findings": [{"finding_type": "exposure"|"identity_signal", "title": string, "description": string, "severity": "low"|"medium"|"high"|"critical", "confidence": number, "needs_review": boolean, "evidence_ids": string[]}]}`
  );

  const validIds = new Set(evidenceList.map((e) => e.id));
  return (result.findings ?? [])
    .filter((f) => Array.isArray(f.evidence_ids) && f.evidence_ids.some((id) => validIds.has(id)))
    .map((f) => ({
      ...f,
      evidence_ids: f.evidence_ids.filter((id) => validIds.has(id)),
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
      finding_type: f.finding_type === "identity_signal" ? ("identity_signal" as const) : ("exposure" as const),
      severity: (["low", "medium", "high", "critical"] as const).includes(f.severity)
        ? f.severity
        : "low",
    }))
    .slice(0, 10);
}
