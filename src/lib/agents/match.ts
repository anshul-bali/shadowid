import { generateJson } from "../providers/google-ai";
import { explainJson } from "../providers/explain";
import type { EvidenceRow, MatchStatus, ScanRow, Severity } from "../types";

export interface EvidenceClassification {
  evidence_id: string;
  status: MatchStatus;
  similarity: number;
  matching_quotes: string[];
  conflicting_quotes: string[];
  reasoning: string;
}

export interface MatchFinding {
  finding_type: "cross_source_link" | "impersonation_candidate" | "conflict";
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  needs_review: boolean;
  evidence_ids: string[];
  data: Record<string, unknown>;
}

export interface MatchAnalysis {
  classifications: EvidenceClassification[];
  findings: MatchFinding[];
}

const SEVERITIES: readonly Severity[] = ["low", "medium", "high", "critical"];

const SYSTEM = `You are the Match Agent for ShadowID, an authorized identity-exposure review tool.
The person submitted their OWN identity details and consented to this scan.
Your job: decide which retrieved pages likely belong to the submitted identity, then find risky combinations of details across the CONFIRMED pages.

Classification rules (one entry per evidence id you were given):
- status "confirmed": the page clearly refers to the submitted identity. You MUST provide at least one matching_quote — a VERBATIM snippet copied from that page's title/excerpt — proving the match (same name plus a corroborating handle, employer, location, or profile URL).
- status "possible": the page might refer to them but the evidence is ambiguous (e.g. only a common name). Provide matching_quote(s) for whatever does align and list conflicting_quotes for anything that does not.
- status "rejected": the page is about someone/something else. Provide conflicting_quotes (verbatim) justifying rejection when available.
- NEVER invent quotes. A quote must appear in the supplied title/excerpt for that evidence id. If you cannot quote support, do not mark it confirmed.
- similarity is your 0..1 estimate that the page refers to the submitted identity.

Connection rules (evidence graph):
- Only connect pages you marked "confirmed". Each connection needs at least two confirmed evidence ids from different sources.
- shared_detail: the specific detail that links them (e.g. same employer + same city). risk: why that COMBINATION raises exposure.
- Impersonation is only ever a possibility for human review, never a confirmed accusation; use cautious language and it will be flagged needs_review.
- Return empty arrays where nothing is supported. Do not fabricate.`;

interface RawMatchResponse {
  classifications?: {
    evidence_id?: string;
    status?: string;
    similarity?: number;
    matching_quotes?: string[];
    conflicting_quotes?: string[];
    reasoning?: string;
  }[];
  connections?: {
    evidence_ids?: string[];
    shared_detail?: string;
    risk?: string;
    severity?: string;
  }[];
  impersonation?: {
    title?: string;
    description?: string;
    severity?: string;
    similarity?: number;
    evidence_ids?: string[];
    matching_quotes?: string[];
    conflicting_quotes?: string[];
    profile_url?: string;
  }[];
}

function normSeverity(s: unknown): Severity {
  return SEVERITIES.includes(s as Severity) ? (s as Severity) : "low";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).filter(Boolean).slice(0, 8) : [];
}

export async function runMatchAnalysis(
  scan: ScanRow,
  evidence: EvidenceRow[]
): Promise<MatchAnalysis> {
  if (evidence.length === 0) return { classifications: [], findings: [] };

  const identity = {
    name: scan.subject_name,
    handles: scan.handles,
    profile_links: scan.profile_links,
    context: scan.context,
  };

  const items = evidence.slice(0, 24).map((e) => ({
    id: e.id,
    source_type: e.source_type,
    url: e.url,
    title: e.title,
    excerpt: (e.excerpt ?? "").slice(0, 700),
  }));
  const validIds = new Set(items.map((e) => e.id));

  const raw = await generateJson<RawMatchResponse>(
    SYSTEM,
    `Submitted identity (self-declared, consented):\n${JSON.stringify(identity, null, 2)}\n\nCandidate pages:\n${JSON.stringify(items, null, 2)}\n\nReturn JSON: {"classifications":[{"evidence_id":string,"status":"confirmed"|"possible"|"rejected","similarity":number,"matching_quotes":string[],"conflicting_quotes":string[],"reasoning":string}],"connections":[{"evidence_ids":string[],"shared_detail":string,"risk":string,"severity":"low"|"medium"|"high"|"critical"}],"impersonation":[{"title":string,"description":string,"severity":"low"|"medium"|"high"|"critical","similarity":number,"evidence_ids":string[],"matching_quotes":string[],"conflicting_quotes":string[],"profile_url":string}]}`
  );

  // --- Classifications: validate ids, enforce the quoted-evidence requirement.
  const byId = new Map(items.map((e) => [e.id, e]));
  const classifications: EvidenceClassification[] = [];
  const statusById = new Map<string, MatchStatus>();
  for (const c of raw.classifications ?? []) {
    const id = String(c.evidence_id ?? "");
    if (!validIds.has(id)) continue;
    const matching = strArray(c.matching_quotes);
    const conflicting = strArray(c.conflicting_quotes);
    let status: MatchStatus = c.status === "confirmed" || c.status === "possible" || c.status === "rejected" ? c.status : "possible";
    // A confirmed/possible classification must quote the page; otherwise downgrade.
    if ((status === "confirmed" || status === "possible") && matching.length === 0 && conflicting.length === 0) {
      status = "possible";
    }
    if (status === "confirmed" && matching.length === 0) {
      status = "possible";
    }
    const similarity = Math.max(0, Math.min(1, Number(c.similarity) || 0));
    statusById.set(id, status);
    classifications.push({
      evidence_id: id,
      status,
      similarity,
      matching_quotes: matching,
      conflicting_quotes: conflicting,
      reasoning: String(c.reasoning ?? "").slice(0, 600),
    });
  }

  const confirmedIds = new Set(
    classifications.filter((c) => c.status === "confirmed").map((c) => c.evidence_id)
  );

  const findings: MatchFinding[] = [];

  // --- Evidence graph: connections among CONFIRMED pages only.
  const connections = (raw.connections ?? [])
    .map((conn) => ({
      ids: [...new Set((conn.evidence_ids ?? []).filter((id) => confirmedIds.has(id)))],
      shared_detail: String(conn.shared_detail ?? "").slice(0, 300),
      risk: String(conn.risk ?? "").slice(0, 400),
      severity: normSeverity(conn.severity),
    }))
    .filter((c) => c.ids.length >= 2 && c.shared_detail)
    .slice(0, 8);

  // OpenAI (Gemini fallback) explains each confirmed connection + a practical action.
  let explanations: { explanation: string; action: string }[] = [];
  if (connections.length > 0) {
    const connPayload = connections.map((c, i) => ({
      index: i,
      sources: c.ids.map((id) => ({ url: byId.get(id)?.url, title: byId.get(id)?.title })),
      shared_detail: c.shared_detail,
      risk: c.risk,
    }));
    try {
      const explained = await explainJson<{ explanations?: { index?: number; explanation?: string; action?: string }[] }>(
        `You explain identity-exposure connections for ShadowID, an authorized review tool. For each connection between CONFIRMED public pages, write a calm, factual explanation of why the combination of details raises exposure, and one practical action the person can take. Reference the source pages by title/URL. Do not invent facts beyond the given shared_detail and risk.`,
        `Connections:\n${JSON.stringify(connPayload, null, 2)}\n\nReturn JSON: {"explanations":[{"index":number,"explanation":string,"action":string}]}`
      );
      const byIndex = new Map<number, { explanation: string; action: string }>();
      for (const ex of explained.explanations ?? []) {
        byIndex.set(Number(ex.index), {
          explanation: String(ex.explanation ?? "").slice(0, 800),
          action: String(ex.action ?? "").slice(0, 500),
        });
      }
      explanations = connections.map((_, i) => byIndex.get(i) ?? { explanation: "", action: "" });
    } catch {
      explanations = connections.map(() => ({ explanation: "", action: "" }));
    }
  }

  connections.forEach((c, i) => {
    const ex = explanations[i] ?? { explanation: "", action: "" };
    findings.push({
      finding_type: "cross_source_link",
      title: c.shared_detail.slice(0, 200),
      description: ex.explanation || c.risk,
      severity: c.severity,
      confidence: 0.8,
      needs_review: false,
      evidence_ids: c.ids,
      data: {
        shared_detail: c.shared_detail,
        risk: c.risk,
        explanation: ex.explanation,
        action: ex.action,
        confirmed: true,
      },
    });
  });

  // --- Impersonation candidates: always flagged for human review.
  for (const imp of raw.impersonation ?? []) {
    const ids = [...new Set((imp.evidence_ids ?? []).filter((id) => validIds.has(id)))];
    if (ids.length === 0) continue;
    findings.push({
      finding_type: "impersonation_candidate",
      title: String(imp.title ?? "Possible impersonation").slice(0, 300),
      description: String(imp.description ?? "").slice(0, 1000),
      severity: normSeverity(imp.severity),
      confidence: Math.max(0, Math.min(1, Number(imp.similarity) || 0.5)),
      needs_review: true,
      evidence_ids: ids,
      data: {
        similarity: Math.max(0, Math.min(1, Number(imp.similarity) || 0)),
        matching_signals: strArray(imp.matching_quotes),
        conflicting_signals: strArray(imp.conflicting_quotes),
        profile_url: typeof imp.profile_url === "string" ? imp.profile_url.slice(0, 500) : undefined,
      },
    });
  }

  // --- Conflict findings for pages carrying verbatim conflicting detail.
  for (const c of classifications) {
    if (c.conflicting_quotes.length === 0) continue;
    if (c.status === "rejected") continue; // rejection itself is the resolution
    findings.push({
      finding_type: "conflict",
      title: `Conflicting detail on ${byId.get(c.evidence_id)?.title ?? "a page"}`.slice(0, 300),
      description: c.reasoning || "Quoted details on this page conflict with the submitted identity.",
      severity: "low",
      confidence: Math.max(0, Math.min(1, c.similarity)),
      needs_review: true,
      evidence_ids: [c.evidence_id],
      data: { conflicting_signals: c.conflicting_quotes },
    });
  }

  return { classifications, findings: findings.slice(0, 20) };
}
