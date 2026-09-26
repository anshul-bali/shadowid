import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runReportAgent } from "@/lib/agents/report";
import type { FindingRow, ReportRow, ScoreBreakdown } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: reportRaw } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!reportRaw) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const report = reportRaw as ReportRow;

  const { data: findingsRaw } = await supabase
    .from("agent_findings")
    .select("*")
    .eq("scan_id", report.scan_id);
  const findings = (findingsRaw ?? []) as FindingRow[];

  try {
    const out = await runReportAgent(
      report.score_breakdown as ScoreBreakdown,
      report.shadow_score,
      findings,
      report.uncertainty_notes ?? ""
    );
    const { data: updated, error } = await supabase
      .from("reports")
      .update({
        summary: out.summary,
        narrative: out.narrative,
        narrative_error: null,
        recommended_actions: out.recommended_actions,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ report: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
