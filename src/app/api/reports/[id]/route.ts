import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const [{ data: scan }, { data: findings }, { data: evidence }, { data: documents }, { data: consent }] =
    await Promise.all([
      supabase.from("scans").select("*").eq("id", report.scan_id).maybeSingle(),
      supabase.from("agent_findings").select("*").eq("scan_id", report.scan_id).order("created_at"),
      supabase.from("source_evidence").select("*").eq("scan_id", report.scan_id).order("relevance", { ascending: false }),
      supabase.from("documents").select("*").eq("scan_id", report.scan_id).order("created_at", { ascending: false }),
      supabase.from("consents").select("*").eq("scan_id", report.scan_id).maybeSingle(),
    ]);

  return NextResponse.json({ report, scan, findings, evidence, documents, consent });
}
