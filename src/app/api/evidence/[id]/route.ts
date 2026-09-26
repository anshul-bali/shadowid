import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeShadowScore } from "@/lib/score";
import type { DocumentRow, EvidenceRow, FindingRow, MatchStatus } from "@/lib/types";

const ALLOWED: MatchStatus[] = ["confirmed", "possible", "rejected"];

// Lets the person correct a Match Agent decision on one of their own pages.
// RLS scopes every query to the signed-in user, so this can only touch their data.
// After the correction the Shadow Score is recomputed from saved data (no AI) and
// the report + scan rows are updated so possible matches stay excluded until reviewed.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { match_status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = body.match_status;
  if (typeof status !== "string" || !ALLOWED.includes(status as MatchStatus)) {
    return NextResponse.json(
      { error: "match_status must be one of: confirmed, possible, rejected" },
      { status: 400 }
    );
  }

  const { data: evidenceRaw } = await supabase
    .from("source_evidence")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!evidenceRaw) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  const evidenceRow = evidenceRaw as EvidenceRow;
  const scanId = evidenceRow.scan_id;

  const { data: updatedEvidence, error: updateError } = await supabase
    .from("source_evidence")
    .update({
      match_status: status as MatchStatus,
      match_reviewed_by: "user",
      match_reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Recompute the score from saved data only.
  const [{ data: findingsRaw }, { data: docsRaw }, { data: allEvidenceRaw }] = await Promise.all([
    supabase.from("agent_findings").select("*").eq("scan_id", scanId),
    supabase.from("documents").select("*").eq("scan_id", scanId),
    supabase.from("source_evidence").select("*").eq("scan_id", scanId),
  ]);
  const findings = (findingsRaw ?? []) as FindingRow[];
  const documents = (docsRaw ?? []) as DocumentRow[];
  const allEvidence = (allEvidenceRaw ?? []) as EvidenceRow[];

  const { score, breakdown, uncertaintyNotes } = computeShadowScore(findings, documents, allEvidence);

  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("scan_id", scanId)
    .maybeSingle();
  if (report) {
    await supabase
      .from("reports")
      .update({ shadow_score: score, score_breakdown: breakdown, uncertainty_notes: uncertaintyNotes })
      .eq("id", report.id);
  }
  await supabase.from("scans").update({ shadow_score: score }).eq("id", scanId);

  return NextResponse.json({ evidence: updatedEvidence, shadow_score: score, breakdown });
}
