import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("reports")
    .select("id, scan_id, shadow_score, summary, created_at, scans(subject_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data });
}
