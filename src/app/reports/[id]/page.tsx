import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, ScoreDial, severityTone } from "@/components/ui";
import { DocumentsPanel } from "@/components/documents-panel";
import { RegenerateNarrative } from "@/components/regenerate-narrative";
import { EvidenceReview } from "@/components/evidence-review";
import type { DocumentRow, EvidenceRow, FindingRow, ReportRow, ScanRow, SearchLogRow } from "@/lib/types";

export const metadata = { title: "Report" };

const FINDING_LABELS: Record<string, string> = {
  exposure: "Exposure",
  identity_signal: "Identity signal",
  cross_source_link: "Cross-source link",
  impersonation_candidate: "Possible impersonation",
  conflict: "Conflicting detail",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/reports/${id}`);

  const { data: reportRaw } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (!reportRaw) notFound();
  const report = reportRaw as ReportRow;

  const [{ data: scan }, { data: findings }, { data: evidence }, { data: documents }, { data: consent }, { data: searchLog }] =
    await Promise.all([
      supabase.from("scans").select("*").eq("id", report.scan_id).maybeSingle(),
      supabase.from("agent_findings").select("*").eq("scan_id", report.scan_id).order("created_at"),
      supabase.from("source_evidence").select("*").eq("scan_id", report.scan_id).order("relevance", { ascending: false }),
      supabase.from("documents").select("*").eq("scan_id", report.scan_id).order("created_at", { ascending: false }),
      supabase.from("consents").select("*").eq("scan_id", report.scan_id).maybeSingle(),
      supabase.from("search_log").select("*").eq("scan_id", report.scan_id).order("created_at"),
    ]);

  const evidenceRows = (evidence ?? []) as EvidenceRow[];
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));
  const findingRows = (findings ?? []) as FindingRow[];
  const scanRow = scan as ScanRow | null;
  const searchLogRows = (searchLog ?? []) as SearchLogRow[];
  const breakdown = report.score_breakdown;

  const confirmedCount = evidenceRows.filter((e) => e.match_status === "confirmed").length;
  const possibleCount = evidenceRows.filter((e) => e.match_status === "possible").length;
  const rejectedCount = evidenceRows.filter((e) => e.match_status === "rejected").length;
  const connections = findingRows.filter((f) => f.finding_type === "cross_source_link");

  const impersonations = findingRows.filter((f) => f.finding_type === "impersonation_candidate");
  const otherFindings = findingRows.filter(
    (f) => f.finding_type !== "impersonation_candidate" && f.finding_type !== "cross_source_link"
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Saved report</p>
          <h1 className="text-2xl font-bold">{scanRow?.subject_name ?? "Identity scan"}</h1>
          <p className="mt-1 text-sm text-muted">
            Scanned {scan ? new Date(scan.created_at).toLocaleString() : ""} · generated{" "}
            {new Date(report.created_at).toLocaleString()}
          </p>
          {consent ? (
            <p className="mt-1 text-xs text-emerald-400">
              ✓ Consent recorded {new Date(consent.granted_at).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-1">
          <ScoreDial score={report.shadow_score} />
          <Badge tone="violet">Shadow Score · EXPERIMENTAL</Badge>
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        <p className="mt-2 text-sm leading-relaxed">{report.summary}</p>
        {report.narrative ? (
          <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm leading-relaxed text-zinc-300">
            {report.narrative.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        {report.narrative_error ? (
          <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
            <p className="text-sm font-medium text-orange-400">
              The Report Agent (OpenAI) failed — the score and findings below are unaffected because they
              come from saved evidence and server code.
            </p>
            <p className="mt-1 break-words text-xs text-muted">{report.narrative_error}</p>
            <div className="mt-3">
              <RegenerateNarrative reportId={report.id} />
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Score factors</h2>
        <p className="mt-1 text-xs text-muted">
          Deterministic server calculation from reviewed evidence — AI explains findings but never produces
          this number. Weights are provisional until validated.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Reviewed exposure", breakdown.exposure, breakdown.weights.exposure],
              ["Cross-source connections", breakdown.connections, breakdown.weights.connections],
              ["Impersonation indicators", breakdown.impersonation, breakdown.weights.impersonation],
              ["Document anomalies", breakdown.documents, breakdown.weights.documents],
            ] as const
          ).map(([label, value, weight]) => (
            <div key={label}>
              <div className="flex justify-between text-xs">
                <span className="text-muted">
                  {label} <span className="text-zinc-500">· weight {(weight * 100).toFixed(0)}%</span>
                </span>
                <span className="font-medium">{value}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {breakdown.reviewed_evidence} evidence item(s) cited by findings.
        </p>
      </Card>

      {report.uncertainty_notes ? (
        <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5">
          <h2 className="text-sm font-semibold text-yellow-400">Uncertainty</h2>
          <p className="mt-1 text-sm text-muted">{report.uncertainty_notes}</p>
        </Card>
      ) : null}

      {impersonations.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-semibold">Possible impersonation — for human review</h2>
          <p className="mt-1 text-xs text-muted">
            These are indications only, never confirmed accusations. Review the cited evidence yourself.
          </p>
          <div className="mt-3 grid gap-3">
            {impersonations.map((f) => (
              <div key={f.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                  <Badge tone="yellow">needs review</Badge>
                  {typeof f.data.similarity === "number" ? (
                    <Badge tone="neutral">similarity {(f.data.similarity * 100).toFixed(0)}%</Badge>
                  ) : null}
                  <span className="text-sm font-medium">{f.title}</span>
                </div>
                {f.description ? <p className="mt-2 text-sm text-muted">{f.description}</p> : null}
                {Array.isArray(f.data.matching_signals) && f.data.matching_signals.length > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    <span className="text-emerald-400">Shared signals:</span>{" "}
                    {f.data.matching_signals.join(" · ")}
                  </p>
                ) : null}
                {Array.isArray(f.data.conflicting_signals) && f.data.conflicting_signals.length > 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    <span className="text-orange-400">Conflicting details:</span>{" "}
                    {f.data.conflicting_signals.join(" · ")}
                  </p>
                ) : null}
                <EvidenceLinks ids={f.evidence_ids} evidenceById={evidenceById} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="font-semibold">Evidence graph — risky detail combinations</h2>
        <p className="mt-1 text-xs text-muted">
          Connections are built only from pages classified <span className="text-emerald-400">confirmed</span>.
          Each shows the shared detail that links them, why that combination raises exposure, and a practical
          action — explained by the Report model with source links.
        </p>
        {connections.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No risky combinations were found across confirmed pages. Confirm more pages above if you believe
            pages belong to you — possible matches are excluded until reviewed.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {connections.map((f) => {
              const action = typeof f.data.action === "string" ? f.data.action : "";
              const risk = typeof f.data.risk === "string" ? f.data.risk : "";
              return (
                <div key={f.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="violet">connection</Badge>
                    <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    <Badge tone="green">confirmed sources only</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{f.title}</p>
                  {f.description ? <p className="mt-1 text-sm text-muted">{f.description}</p> : null}
                  {risk && risk !== f.description ? (
                    <p className="mt-1 text-xs text-muted"><span className="text-orange-400">Why it matters:</span> {risk}</p>
                  ) : null}
                  {action ? (
                    <p className="mt-1 text-xs text-muted"><span className="text-accent">Action:</span> {action}</p>
                  ) : null}
                  <EvidenceLinks ids={f.evidence_ids} evidenceById={evidenceById} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Findings ({otherFindings.length})</h2>
        {otherFindings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            The agents found no supported findings beyond impersonation checks for this scan.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {otherFindings.map((f) => (
              <div key={f.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">{FINDING_LABELS[f.finding_type] ?? f.finding_type}</Badge>
                  <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                  <Badge tone="neutral">confidence {(f.confidence * 100).toFixed(0)}%</Badge>
                  <Badge tone="neutral">{f.agent} agent</Badge>
                  {f.needs_review ? <Badge tone="yellow">uncertain — flagged for review</Badge> : null}
                </div>
                <p className="mt-2 text-sm font-medium">{f.title}</p>
                {f.description ? <p className="mt-1 text-sm text-muted">{f.description}</p> : null}
                <EvidenceLinks ids={f.evidence_ids} evidenceById={evidenceById} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {report.recommended_actions.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-semibold">Recommended actions</h2>
          <ul className="mt-3 grid gap-3">
            {report.recommended_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <Badge tone={severityTone(a.priority)}>{a.priority}</Badge>
                <div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="font-semibold">Document checks</h2>
        <p className="mt-1 mb-4 text-xs text-muted">
          Optional: upload your own document for OCR, field-consistency and metadata observations.
          Processing happens on demand, files are stored privately, and you can delete them at any time.
        </p>
        <DocumentsPanel scanId={report.scan_id} initialDocuments={(documents ?? []) as DocumentRow[]} />
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Source evidence &amp; match decisions ({evidenceRows.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">{confirmedCount} confirmed</Badge>
            <Badge tone="yellow">{possibleCount} possible</Badge>
            <Badge tone="red">{rejectedCount} rejected</Badge>
          </div>
        </div>
        <EvidenceReview evidence={evidenceRows} />
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Sources searched ({searchLogRows.length})</h2>
        <p className="mt-1 text-xs text-muted">
          Every source and query attempted during collection, with its retrieval outcome. An empty or failed
          lookup is recorded here — <span className="text-yellow-400">no result is never treated as proof that
          no exposure exists</span>, only that this source returned nothing this time.
        </p>
        {searchLogRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No search log was recorded for this scan.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {searchLogRows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <Badge tone="neutral">{s.source}</Badge>
                <span className="text-muted">{s.query ?? "—"}</span>
                <span className="ml-auto flex items-center gap-2">
                  {s.outcome === "ok" ? (
                    <Badge tone="green">{s.result_count} result{s.result_count === 1 ? "" : "s"}</Badge>
                  ) : s.outcome === "empty" ? (
                    <Badge tone="yellow">no results</Badge>
                  ) : (
                    <Badge tone="red">failed</Badge>
                  )}
                </span>
                {s.detail ? <span className="w-full truncate text-zinc-500">{s.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/reports" variant="secondary">All reports</Button>
        <Button href="/dashboard" variant="secondary">Dashboard</Button>
        {scanRow ? (
          <Link href={`/scan/${scanRow.id}`} className="px-4 py-2 text-sm text-muted underline">
            Scan run history
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceLinks({
  ids,
  evidenceById,
}: {
  ids: string[];
  evidenceById: Map<string, EvidenceRow>;
}) {
  const items = (ids ?? []).map((id) => evidenceById.get(id)).filter(Boolean) as EvidenceRow[];
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((e) => (
        <a
          key={e.id}
          href={e.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-64 items-center gap-1 truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted hover:text-accent"
        >
          🔗 <span className="truncate">{e.title}</span>
        </a>
      ))}
    </div>
  );
}
