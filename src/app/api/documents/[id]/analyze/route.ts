import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVisionJson } from "@/lib/providers/google-ai";
import type { ConsistencyCheck, DocumentAnalysis, DocumentAnomaly, DocumentRow, Severity } from "@/lib/types";

const SYSTEM = `You are ShadowID's document review assistant. The user uploaded their OWN document for an authorized identity review.
Perform: (1) OCR — extract visible text; (2) field extraction — names, dates, numbers, addresses as key/value pairs; (3) internal consistency checks — do fields agree with each other (e.g. birth date vs age, expiry vs issue date, name spellings)?
Describe anomalies neutrally. NEVER claim the document is authentic or fraudulent — only describe what is observable and what could not be verified. If the image is unreadable, say so with low-severity observations.
Return JSON only.`;

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const document = doc as DocumentRow;

  await supabase.from("documents").update({ status: "pending", error: null }).eq("id", id);

  try {
    const admin = createAdminClient();
    const { data: fileData, error: downloadError } = await admin.storage
      .from("documents")
      .download(document.storage_path);
    if (downloadError || !fileData) throw new Error(`Could not retrieve file: ${downloadError?.message}`);

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");

    const ai = await generateVisionJson<{
      ocr_text?: string;
      fields?: Record<string, string>;
      consistency?: ConsistencyCheck[];
      anomalies?: DocumentAnomaly[];
      notes?: string;
    }>(
      SYSTEM,
      `Filename: ${document.original_filename}\nMIME type: ${document.mime_type}\nSize: ${document.file_size} bytes\n\nAnalyze this document and return JSON: {"ocr_text": string, "fields": object, "consistency": [{"field": string, "observation": string, "status": "consistent"|"inconsistent"|"unverifiable"}], "anomalies": [{"kind": "ocr"|"consistency"|"metadata", "observation": string, "severity": "low"|"medium"|"high"|"critical"}], "notes": string}`,
      base64,
      document.mime_type
    );

    // Deterministic server-side metadata checks (not AI).
    const metadataAnomalies: DocumentAnomaly[] = [];
    const ext = document.original_filename.split(".").pop()?.toLowerCase() ?? "";
    const extForMime: Record<string, string[]> = {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/webp": ["webp"],
      "application/pdf": ["pdf"],
    };
    if (ext && !(extForMime[document.mime_type] ?? []).includes(ext)) {
      metadataAnomalies.push({
        kind: "metadata",
        observation: `File extension ".${ext}" does not match its declared content type (${document.mime_type}).`,
        severity: "low",
      });
    }
    if (document.file_size < 2048) {
      metadataAnomalies.push({
        kind: "metadata",
        observation: "File is unusually small for a document scan; content may be cropped or low quality.",
        severity: "low",
      });
    }

    const analysis: DocumentAnalysis = {
      ocr_text: String(ai.ocr_text ?? "").slice(0, 8000),
      fields: Object.fromEntries(
        Object.entries(ai.fields ?? {})
          .slice(0, 30)
          .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)])
      ),
      consistency: (ai.consistency ?? []).slice(0, 20).map((c) => ({
        field: String(c.field ?? "").slice(0, 60),
        observation: String(c.observation ?? "").slice(0, 400),
        status: (["consistent", "inconsistent", "unverifiable"] as const).includes(c.status)
          ? c.status
          : "unverifiable",
      })),
      anomalies: [
        ...(ai.anomalies ?? [])
          .slice(0, 20)
          .map((a) => ({
            kind: (["ocr", "consistency", "metadata"] as const).includes(a.kind) ? a.kind : "ocr",
            observation: String(a.observation ?? "").slice(0, 400),
            severity: SEVERITIES.includes(a.severity) ? a.severity : "low",
          })),
        ...metadataAnomalies,
      ],
      notes: String(ai.notes ?? "").slice(0, 1000),
    };

    const { data: updated, error } = await supabase
      .from("documents")
      .update({ status: "analyzed", analysis, error: null })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ document: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("documents")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
