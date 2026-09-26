export type Severity = "low" | "medium" | "high" | "critical";
export type ScanStatus = "pending" | "running" | "completed" | "failed";
export type ScanStage =
  | "queued"
  | "collecting"
  | "researching"
  | "matching"
  | "reporting"
  | "scoring"
  | "done"
  | "failed";

export interface ScanRow {
  id: string;
  user_id: string;
  subject_name: string;
  handles: string[];
  profile_links: string[];
  context: string | null;
  status: ScanStatus;
  stage: ScanStage;
  stage_detail: string | null;
  error: string | null;
  shadow_score: number | null;
  created_at: string;
  updated_at: string;
}

export type MatchStatus = "unreviewed" | "confirmed" | "possible" | "rejected";

export interface EvidenceRow {
  id: string;
  scan_id: string;
  url: string;
  title: string;
  excerpt: string | null;
  source_type: string;
  query: string | null;
  relevance: number | null;
  retrieved_at: string;
  match_status: MatchStatus;
  match_quotes: string[];
  match_conflicting: string[];
  match_notes: string | null;
  match_similarity: number | null;
  match_reviewed_by: "agent" | "user" | null;
  match_reviewed_at: string | null;
}

export type SearchOutcome = "ok" | "empty" | "failed";

export interface SearchLogRow {
  id: string;
  scan_id: string;
  user_id: string;
  source: string;
  query: string | null;
  result_count: number;
  outcome: SearchOutcome;
  detail: string | null;
  created_at: string;
}

export type AgentName = "research" | "match" | "report";

export interface FindingRow {
  id: string;
  scan_id: string;
  agent: AgentName;
  finding_type: string;
  title: string;
  description: string | null;
  severity: Severity;
  confidence: number;
  needs_review: boolean;
  evidence_ids: string[];
  data: Record<string, unknown>;
  created_at: string;
}

export interface ScoreBreakdown {
  exposure: number;
  connections: number;
  impersonation: number;
  documents: number;
  weights: Record<string, number>;
  reviewed_evidence: number;
}

export interface RecommendedAction {
  title: string;
  detail: string;
  priority: Severity;
}

export interface ReportRow {
  id: string;
  scan_id: string;
  user_id: string;
  shadow_score: number;
  score_breakdown: ScoreBreakdown;
  summary: string;
  narrative: string | null;
  narrative_error: string | null;
  recommended_actions: RecommendedAction[];
  uncertainty_notes: string | null;
  created_at: string;
}

export interface ConsistencyCheck {
  field: string;
  observation: string;
  status: "consistent" | "inconsistent" | "unverifiable";
}

export interface DocumentAnomaly {
  kind: "ocr" | "consistency" | "metadata";
  observation: string;
  severity: Severity;
}

export interface DocumentAnalysis {
  ocr_text: string;
  fields: Record<string, string>;
  consistency: ConsistencyCheck[];
  anomalies: DocumentAnomaly[];
  notes: string;
}

export type DocumentStatus = "pending" | "analyzed" | "failed";

export interface DocumentRow {
  id: string;
  user_id: string;
  scan_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  status: DocumentStatus;
  analysis: DocumentAnalysis | null;
  error: string | null;
  created_at: string;
}

export interface ScanInput {
  subject_name: string;
  handles: string[];
  profile_links: string[];
  context: string | null;
  consent_statement: string;
}
