import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";

const scanInput = z.object({
  subject_name: z.string().trim().min(2).max(120),
  handles: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  profile_links: z
    .array(z.string().trim().url("Each profile link must be a valid URL").max(500))
    .max(10)
    .default([]),
  context: z.string().trim().max(1000).nullish(),
  consent_granted: z.boolean(),
  consent_statement: z.string().min(10),
});

export async function GET() {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scans: data });
}

export async function POST(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = scanInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  if (!parsed.data.consent_granted) {
    return NextResponse.json(
      { error: "Consent is required before a scan can run" },
      { status: 403 }
    );
  }

  const input = parsed.data;

  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .insert({
      user_id: user.id,
      subject_name: input.subject_name,
      handles: input.handles,
      profile_links: input.profile_links,
      context: input.context || null,
      status: "pending",
      stage: "queued",
    })
    .select()
    .single();

  if (scanError || !scan) {
    return NextResponse.json({ error: scanError?.message ?? "Failed to create scan" }, { status: 500 });
  }

  const { error: consentError } = await supabase.from("consents").insert({
    user_id: user.id,
    scan_id: scan.id,
    consent_type: "identity_scan",
    statement: input.consent_statement,
    granted: true,
  });
  if (consentError) {
    await supabase.from("scans").delete().eq("id", scan.id);
    return NextResponse.json({ error: consentError.message }, { status: 500 });
  }

  return NextResponse.json({ scan }, { status: 201 });
}
