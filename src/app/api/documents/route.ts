import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export async function GET(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const scanId = new URL(request.url).searchParams.get("scan_id");
  let query = supabase
    .from("documents")
    .select("id, scan_id, original_filename, mime_type, file_size, status, error, analysis, created_at")
    .order("created_at", { ascending: false });
  if (scanId) query = query.eq("scan_id", scanId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const scanId = (form?.get("scan_id") as string | null) || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type ${file.type}. Allowed: PNG, JPEG, WebP, PDF.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 400 });
  }

  if (scanId) {
    const { data: scan } = await supabase
      .from("scans")
      .select("id")
      .eq("id", scanId)
      .maybeSingle();
    if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "document";
  const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      scan_id: scanId,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 200),
      mime_type: file.type,
      file_size: file.size,
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !doc) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: insertError?.message ?? "Failed to save document" }, { status: 500 });
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}
