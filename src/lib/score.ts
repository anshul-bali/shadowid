import type { DocumentRow, EvidenceRow, FindingRow, ScoreBreakdown } from "./types";

// Shadow Score — deterministic, auditable server-side calculation.
// AI explains findings; it never produces this number.
// EXPERIMENTAL: weights are provisional until validated against outcomes.
//
// Confirmation gating: a finding only counts toward the score when EVERY page it
// cites has been classified "confirmed". Pages the Match Agent marked "possible"
// (or left unreviewed, or the user rejected) are EXCLUDED until a human reviews
// them. This keeps ambiguous same-name matches and un-reviewed impersonation
// signals from inflating the score.

export const SCORE_WEIGHTS = {
  exposure: 0.35,
  connections: 0.2,
  impersonation: 0.3,
  documents: 0.15,
} as const;

const SEVERITY_WEIGHT: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// A finding is countable only if it cites evidence and every cited page is confirmed.
function isConfirmed(f: FindingRow, confirmedIds: Set<string>): boolean {
  const ids = f.evidence_ids ?? [];
  return ids.length > 0 && ids.every((id) => confirmedIds.has(id));
}

function exposureComponent(findings: FindingRow[], confirmedIds: Set<string>): number {
  const exposures = findings.filter(
    (f) => f.finding_type === "exposure" && isConfirmed(f, confirmedIds)
  );
  if (exposures.length === 0) return 0;
  const weighted = exposures.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0.25) * f.confidence,
    0
  );
  // Saturating: ~4 high-severity confirmed exposures reach the ceiling.
  return clamp01(weighted / 3) * 100;
}

function connectionsComponent(findings: FindingRow[], confirmedIds: Set<string>): number {
  const links = findings.filter(
    (f) => f.finding_type === "cross_source_link" && (f.evidence_ids ?? []).length >= 2 && isConfirmed(f, confirmedIds)
  );
  if (links.length === 0) return 0;
  const weighted = links.reduce((sum, f) => sum + f.confidence, 0);
  return clamp01(weighted / 3) * 100;
}

function impersonationComponent(findings: FindingRow[], confirmedIds: Set<string>): number {
  const candidates = findings.filter(
    (f) => f.finding_type === "impersonation_candidate" && isConfirmed(f, confirmedIds)
  );
  if (candidates.length === 0) return 0;
  // Highest-confidence candidate dominates; others add a small tail.
  const sims = candidates
    .map((f) => clamp01((f.data.similarity as number | undefined) ?? f.confidence) * f.confidence)
    .sort((a, b) => b - a);
  const tail = sims.slice(1).reduce((s, v) => s + v * 0.25, 0);
  return clamp01((sims[0] ?? 0) + tail) * 100;
}

function documentsComponent(documents: DocumentRow[]): number {
  const analyzed = documents.filter((d) => d.status === "analyzed" && d.analysis);
  if (analyzed.length === 0) return 0;
  let total = 0;
  for (const doc of analyzed) {
    const anomalies = doc.analysis?.anomalies ?? [];
    const weighted = anomalies.reduce(
      (sum, a) => sum + (SEVERITY_WEIGHT[a.severity] ?? 0.25),
      0
    );
    total += clamp01(weighted / 2);
  }
  return clamp01(total / analyzed.length) * 100;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  uncertaintyNotes: string;
}

export function computeShadowScore(
  findings: FindingRow[],
  documents: DocumentRow[],
  evidence: EvidenceRow[]
): ScoreResult {
  const confirmedIds = new Set(
    evidence.filter((e) => e.match_status === "confirmed").map((e) => e.id)
  );
  const possibleCount = evidence.filter((e) => e.match_status === "possible").length;
  const unreviewedCount = evidence.filter((e) => e.match_status === "unreviewed").length;

  const exposure = exposureComponent(findings, confirmedIds);
  const connections = connectionsComponent(findings, confirmedIds);
  const impersonation = impersonationComponent(findings, confirmedIds);
  const docs = documentsComponent(documents);

  const raw =
    exposure * SCORE_WEIGHTS.exposure +
    connections * SCORE_WEIGHTS.connections +
    impersonation * SCORE_WEIGHTS.impersonation +
    docs * SCORE_WEIGHTS.documents;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  // Findings held back because they cite possible/unreviewed pages.
  const pendingFindings = findings.filter(
    (f) => (f.evidence_ids ?? []).length > 0 && !isConfirmed(f, confirmedIds)
  ).length;
  const reviewedEvidence = new Set<string>();
  for (const f of findings) {
    if (isConfirmed(f, confirmedIds)) for (const id of f.evidence_ids) reviewedEvidence.add(id);
  }

  const notes = [
    "EXPERIMENTAL score: component weights are provisional and not yet validated.",
    `Counts only CONFIRMED pages (${confirmedIds.size} confirmed).`,
    possibleCount + unreviewedCount > 0
      ? `${possibleCount} possible and ${unreviewedCount} unreviewed page(s) are EXCLUDED from the score until you review them.`
      : null,
    pendingFindings > 0
      ? `${pendingFindings} finding(s) are held back because they cite pages that are not yet confirmed.`
      : null,
    "Score reflects reviewed public evidence only. Absence of findings is not proof of absence.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    score,
    breakdown: {
      exposure: Math.round(exposure),
      connections: Math.round(connections),
      impersonation: Math.round(impersonation),
      documents: Math.round(docs),
      weights: { ...SCORE_WEIGHTS },
      reviewed_evidence: reviewedEvidence.size,
    },
    uncertaintyNotes: notes,
  };
}
