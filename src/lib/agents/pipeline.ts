import type { SupabaseClient } from "@supabase/supabase-js";
import { computeShadowScore } from "../score";
import type { DocumentRow, EvidenceRow, FindingRow, ScanRow, ScanStage, SearchLogRow } from "../types";
import { tavilySearch } from "../providers/tavily";
import { collectAuxOsint, fetchProfileHit } from "../providers/osint";
import { runMatchAnalysis } from "./match";
import { runReportAgent } from "./report";
import { runResearchAgent } from "./research";

const MAX_QUERIES = 4;
const STAGE_ORDER: ScanStage[] = ["collecting", "researching", "matching", "reporting"];
const STAGE_LABELS: Record<string, string> = {
  collecting: "Collecting public sources (profiles, Tavily, GitHub, Wikipedia, HN, OpenAlex)",
  researching: "Research Agent reviewing results (Google AI)",
  matching: "Match Agent checking evidence attribution (Google AI)",
  reporting: "Report Agent writing explanation (OpenAI) + Shadow Score",
};

async function setStage(admin: SupabaseClient, scanId: string, stage: ScanStage, detail?: string) {
  await admin
    .from("scans")
    .update({ stage, stage_detail: detail ?? STAGE_LABELS[stage] ?? null, updated_at: new Date().toISOString() })
    .eq("id", scanId);
}

async function failScan(admin: SupabaseClient, scanId: string, stage: ScanStage, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  // Keep `stage` at the value where the failure happened so retry can resume there.
  await admin
    .from("scans")
    .update({
      status: "failed",
      stage_detail: null,
      error: `Failed during ${stage}: ${message}`.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);
}

function buildQueries(scan: ScanRow): string[] {
  const queries = [`"${scan.subject_name}"`];
  for (const handle of scan.handles.slice(0, 2)) {
    queries.push(`"${scan.subject_name}" ${handle}`);
  }
  if (scan.context) {
    queries.push(`"${scan.subject_name}" ${scan.context.split(/\s+/).slice(0, 4).join(" ")}`);
  }
  return [...new Set(queries)].slice(0, MAX_QUERIES);
}

const MAX_EVIDENCE_ROWS = 60;

interface EvidenceInsert {
  scan_id: string;
  user_id: string;
  url: string;
  title: string;
  excerpt: string | null;
  source_type: string;
  query: string | null;
  relevance: number | null;
  retrieved_at: string;
}

async function stageCollect(admin: SupabaseClient, scan: ScanRow) {
  await setStage(admin, scan.id, "collecting");
  const queries = buildQueries(scan);
  const seen = new Set<string>();
  const rows: EvidenceInsert[] = [];
  const log: Omit<SearchLogRow, "id" | "scan_id" | "user_id" | "created_at">[] = [];

  const logSearch = (source: string, query: string | null, count: number, outcome: "ok" | "empty" | "failed", detail?: string) => {
    log.push({ source, query, result_count: count, outcome, detail: detail?.slice(0, 300) ?? null });
  };

  const push = (hit: {
    url: string;
    title: string;
    excerpt?: string | null;
    source_type: string;
    query?: string | null;
    relevance?: number | null;
  }) => {
    if (!hit.url || seen.has(hit.url) || rows.length >= MAX_EVIDENCE_ROWS) return;
    seen.add(hit.url);
    rows.push({
      scan_id: scan.id,
      user_id: scan.user_id,
      url: hit.url,
      title: (hit.title || hit.url).slice(0, 300),
      excerpt: hit.excerpt?.slice(0, 1200) ?? null,
      source_type: hit.source_type,
      query: hit.query ?? null,
      relevance: typeof hit.relevance === "number" ? hit.relevance : null,
      retrieved_at: new Date().toISOString(),
    });
  };

  // 1) Submitted profile links (SSRF-guarded) are the highest-signal evidence.
  for (const link of scan.profile_links.slice(0, 5)) {
    await admin.from("scans").update({ stage_detail: `Fetching submitted profile: ${link}` }).eq("id", scan.id);
    const hit = await fetchProfileHit(link);
    if (hit) {
      push({ ...hit, relevance: 1 });
      logSearch("profile", link, 1, "ok");
    } else {
      // A submitted link that could not be retrieved is logged, not hidden.
      logSearch("profile", link, 0, "failed", "Could not retrieve page (blocked, offline, or non-HTML)");
    }
  }

  // 2) Tavily web search over name/handles/context.
  for (const q of queries) {
    await admin.from("scans").update({ stage_detail: `Searching: ${q}` }).eq("id", scan.id);
    try {
      const results = await tavilySearch(q);
      for (const r of results) {
        push({ url: r.url, title: r.title, excerpt: r.content, source_type: "web", query: q, relevance: r.score });
      }
      logSearch("tavily", q, results.length, results.length > 0 ? "ok" : "empty");
    } catch (err) {
      // Web search is best-effort; aux OSINT + profiles may still yield evidence.
      logSearch("tavily", q, 0, "failed", err instanceof Error ? err.message : String(err));
    }
  }

  // 3) Key-free auxiliary OSINT (GitHub, Hacker News, Wikipedia, OpenAlex).
  await admin.from("scans").update({ stage_detail: "Checking public sources (GitHub, Wikipedia, HN, OpenAlex)" }).eq("id", scan.id);
  try {
    const aux = await collectAuxOsint(scan.subject_name, scan.handles);
    for (const hit of aux.hits) {
      push({ url: hit.url, title: hit.title, excerpt: hit.excerpt, source_type: hit.source_type, query: hit.query, relevance: 0.5 });
    }
    for (const entry of aux.log) {
      logSearch(entry.source, entry.query, entry.result_count, entry.outcome, entry.detail);
    }
  } catch (err) {
    logSearch("aux_osint", scan.subject_name, 0, "failed", err instanceof Error ? err.message : String(err));
  }

  if (rows.length > 0) await admin.from("source_evidence").insert(rows);
  if (log.length > 0) {
    await admin.from("search_log").insert(
      log.map((l) => ({ ...l, scan_id: scan.id, user_id: scan.user_id }))
    );
  }
  const webCount = rows.filter((r) => r.source_type === "web").length;
  const auxCount = rows.length - webCount;
  await setStage(
    admin,
    scan.id,
    "researching",
    `${rows.length} public page(s) saved as evidence (${auxCount} from profiles/direct sources, ${webCount} from web search) across ${log.length} source query(s)`
  );
}

async function stageResearch(admin: SupabaseClient, scan: ScanRow) {
  await setStage(admin, scan.id, "researching");
  const { data: evidence } = await admin
    .from("source_evidence")
    .select("*")
    .eq("scan_id", scan.id)
    .order("relevance", { ascending: false });
  const findings = await runResearchAgent(scan, (evidence ?? []) as EvidenceRow[]);
  if (findings.length > 0) {
    await admin.from("agent_findings").insert(
      findings.map((f) => ({
        scan_id: scan.id,
        user_id: scan.user_id,
        agent: "research",
        finding_type: f.finding_type,
        title: f.title.slice(0, 300),
        description: f.description?.slice(0, 2000) ?? null,
        severity: f.severity,
        confidence: f.confidence,
        needs_review: f.needs_review,
        evidence_ids: f.evidence_ids,
        data: {},
      }))
    );
  }
  await setStage(admin, scan.id, "matching", `${findings.length} research finding(s) recorded`);
}

async function stageMatch(admin: SupabaseClient, scan: ScanRow) {
  await setStage(admin, scan.id, "matching");
  const { data: evidence } = await admin
    .from("source_evidence")
    .select("*")
    .eq("scan_id", scan.id)
    .order("relevance", { ascending: false });
  const evidenceRows = (evidence ?? []) as EvidenceRow[];

  const { classifications, findings } = await runMatchAnalysis(scan, evidenceRows);

  // Persist the agent's per-page classification (user can correct it later).
  const now = new Date().toISOString();
  for (const c of classifications) {
    await admin
      .from("source_evidence")
      .update({
        match_status: c.status,
        match_quotes: c.matching_quotes,
        match_conflicting: c.conflicting_quotes,
        match_notes: c.reasoning || null,
        match_similarity: c.similarity,
        match_reviewed_by: "agent",
        match_reviewed_at: now,
      })
      .eq("id", c.evidence_id)
      .eq("scan_id", scan.id);
  }

  if (findings.length > 0) {
    await admin.from("agent_findings").insert(
      findings.map((f) => ({
        scan_id: scan.id,
        user_id: scan.user_id,
        agent: "match",
        finding_type: f.finding_type,
        title: f.title.slice(0, 300),
        description: f.description?.slice(0, 2000) ?? null,
        severity: f.severity,
        confidence: f.confidence,
        needs_review: f.needs_review,
        evidence_ids: f.evidence_ids,
        data: f.data ?? {},
      }))
    );
  }

  const confirmed = classifications.filter((c) => c.status === "confirmed").length;
  const possible = classifications.filter((c) => c.status === "possible").length;
  const rejected = classifications.filter((c) => c.status === "rejected").length;
  await setStage(
    admin,
    scan.id,
    "reporting",
    `Classified ${classifications.length} page(s): ${confirmed} confirmed, ${possible} possible, ${rejected} rejected · ${findings.length} match finding(s)`
  );
}

async function stageReport(admin: SupabaseClient, scan: ScanRow) {
  await setStage(admin, scan.id, "reporting", "Computing Shadow Score and generating report");

  const { data: findingsRaw } = await admin
    .from("agent_findings")
    .select("*")
    .eq("scan_id", scan.id);
  const findings = (findingsRaw ?? []) as FindingRow[];

  const { data: docsRaw } = await admin
    .from("documents")
    .select("*")
    .eq("scan_id", scan.id);
  const documents = (docsRaw ?? []) as DocumentRow[];

  const { data: evidenceRaw } = await admin
    .from("source_evidence")
    .select("*")
    .eq("scan_id", scan.id);
  const evidence = (evidenceRaw ?? []) as EvidenceRow[];

  const { score, breakdown, uncertaintyNotes } = computeShadowScore(findings, documents, evidence);

  let narrative: string | null = null;
  let summary = "Scan completed. The Shadow Score and findings below are based solely on the saved evidence.";
  let narrativeError: string | null = null;
  let actions: { title: string; detail: string; priority: string }[] = [];

  try {
    const out = await runReportAgent(breakdown, score, findings, uncertaintyNotes);
    narrative = out.narrative;
    summary = out.summary;
    actions = out.recommended_actions;
  } catch (err) {
    // Provider failure is surfaced in the report; the scan itself still completes
    // because the score and findings come from auditable server code and saved data.
    narrativeError = err instanceof Error ? err.message : String(err);
  }

  const { data: existingReport } = await admin
    .from("reports")
    .select("id")
    .eq("scan_id", scan.id)
    .maybeSingle();

  const reportRow = {
    scan_id: scan.id,
    user_id: scan.user_id,
    shadow_score: score,
    score_breakdown: breakdown,
    summary,
    narrative,
    narrative_error: narrativeError,
    recommended_actions: actions,
    uncertainty_notes: uncertaintyNotes,
  };

  if (existingReport) {
    await admin.from("reports").update(reportRow).eq("id", existingReport.id);
  } else {
    await admin.from("reports").insert(reportRow);
  }

  await admin
    .from("scans")
    .update({
      status: "completed",
      stage: "done",
      stage_detail: null,
      error: null,
      shadow_score: score,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scan.id);
}

export interface RunResult {
  scan: ScanRow;
  done: boolean;
}

export async function runScanStage(admin: SupabaseClient, scanId: string): Promise<RunResult> {
  const { data: scanRaw, error } = await admin
    .from("scans")
    .select("*")
    .eq("id", scanId)
    .maybeSingle();
  if (error || !scanRaw) throw new Error(`Scan ${scanId} not found`);
  const scan = scanRaw as ScanRow;

  if (scan.status === "completed") return { scan, done: true };

  // Retry after failure: clean up the failed stage's partial output and resume there.
  if (scan.status === "failed") {
    const failedStage: ScanStage = STAGE_ORDER.includes(scan.stage) ? scan.stage : "collecting";
    if (failedStage === "collecting") {
      await admin.from("source_evidence").delete().eq("scan_id", scanId);
      await admin.from("search_log").delete().eq("scan_id", scanId);
    } else if (failedStage === "researching") {
      await admin.from("agent_findings").delete().eq("scan_id", scanId).eq("agent", "research");
    } else if (failedStage === "matching") {
      await admin.from("agent_findings").delete().eq("scan_id", scanId).eq("agent", "match");
      // Reset agent classifications so the re-run reclassifies cleanly, but keep
      // any user corrections (match_reviewed_by='user') intact.
      await admin
        .from("source_evidence")
        .update({
          match_status: "unreviewed",
          match_quotes: [],
          match_conflicting: [],
          match_notes: null,
          match_similarity: null,
          match_reviewed_by: null,
          match_reviewed_at: null,
        })
        .eq("scan_id", scanId)
        .neq("match_reviewed_by", "user");
    } else {
      await admin.from("reports").delete().eq("scan_id", scanId);
    }
    await admin
      .from("scans")
      .update({ status: "running", stage: failedStage, error: null, updated_at: new Date().toISOString() })
      .eq("id", scanId);
    scan.status = "running";
    scan.stage = failedStage;
  }

  await admin.from("scans").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", scanId);

  const currentStage: ScanStage = scan.stage === "queued" ? "collecting" : scan.stage;
  try {
    switch (currentStage) {
      case "collecting":
        await stageCollect(admin, scan);
        break;
      case "researching":
        await stageResearch(admin, scan);
        break;
      case "matching":
        await stageMatch(admin, scan);
        break;
      case "reporting":
        await stageReport(admin, scan);
        return { scan: { ...scan, status: "completed", stage: "done" }, done: true };
      default:
        break;
    }
  } catch (err) {
    await failScan(admin, scanId, currentStage, err);
    const { data: failed } = await admin.from("scans").select("*").eq("id", scanId).maybeSingle();
    return { scan: (failed ?? scan) as ScanRow, done: false };
  }

  const nextIndex = STAGE_ORDER.indexOf(currentStage) + 1;
  const done = nextIndex >= STAGE_ORDER.length;
  const { data: updated } = await admin.from("scans").select("*").eq("id", scanId).maybeSingle();
  return { scan: (updated ?? scan) as ScanRow, done };
}
