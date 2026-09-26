import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: scan, error } = await supabase
    .from("scans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("scan_id", id)
    .maybeSingle();

  return NextResponse.json({ scan, report_id: report?.id ?? null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: scan } = await supabase
    .from("scans")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const { error } = await supabase.from("scans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Convenience alias so the client can POST /api/scans/[id] to trigger a stage run.
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: scan } = await supabase
    .from("scans")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const admin = createAdminClient();
  const { runScanStage } = await import("@/lib/agents/pipeline");
  const result = await runScanStage(admin, id);
  return NextResponse.json(result);
}
