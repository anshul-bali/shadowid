"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Spinner, severityTone } from "@/components/ui";
import type { DocumentRow } from "@/lib/types";

export function DocumentsPanel({
  scanId,
  initialDocuments,
}: {
  scanId: string;
  initialDocuments: DocumentRow[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch(`/api/documents?scan_id=${scanId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDocuments(data.documents ?? []);
  }

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("scan_id", scanId);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    await refresh();
  }

  async function analyze(doc: DocumentRow) {
    setBusyId(doc.id);
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}/analyze`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(`Analysis failed for ${doc.original_filename}: ${data.error ?? res.statusText}`);
    }
    await refresh();
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Delete "${doc.original_filename}" and its analysis permanently?`)) return;
    setBusyId(doc.id);
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Delete failed");
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-sm file:text-foreground hover:file:bg-border/50"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
          }}
        />
        {uploading ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="text-accent" /> Uploading…
          </span>
        ) : null}
        <p className="text-xs text-muted">
          PNG, JPEG, WebP or PDF · max 10 MB · stored privately · deletable at any time
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No documents uploaded for this scan. Upload one of your own documents for OCR, field-consistency
          and metadata observations. Results describe anomalies only — never whether a document is
          authentic or fraudulent.
        </p>
      ) : (
        documents.map((doc) => (
          <Card key={doc.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.original_filename}</p>
                <p className="text-xs text-muted">
                  {(doc.file_size / 1024).toFixed(0)} KB · {doc.mime_type} ·{" "}
                  {new Date(doc.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc.status === "pending" ? <Badge tone="yellow">Not analyzed</Badge> : null}
                {doc.status === "analyzed" ? <Badge tone="green">Analyzed</Badge> : null}
                {doc.status === "failed" ? <Badge tone="red">Analysis failed</Badge> : null}
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={busyId === doc.id}
                  onClick={() => void analyze(doc)}
                >
                  {busyId === doc.id ? <Spinner /> : null}
                  {doc.status === "analyzed" ? "Re-analyze" : "Analyze"}
                </Button>
                <Button
                  variant="danger"
                  className="px-3 py-1.5 text-xs"
                  disabled={busyId === doc.id}
                  onClick={() => void remove(doc)}
                >
                  Delete
                </Button>
              </div>
            </div>
            {doc.error ? (
              <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {doc.error}
              </p>
            ) : null}
            {doc.status === "analyzed" && doc.analysis ? (
              <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Extracted fields</p>
                  {Object.keys(doc.analysis.fields).length === 0 ? (
                    <p className="mt-1 text-xs text-muted">No fields could be read.</p>
                  ) : (
                    <dl className="mt-1 grid gap-1">
                      {Object.entries(doc.analysis.fields).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <dt className="shrink-0 font-medium text-muted">{k}:</dt>
                          <dd className="break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {doc.analysis.notes ? (
                    <p className="mt-2 text-xs text-muted">{doc.analysis.notes}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Consistency checks</p>
                    {doc.analysis.consistency.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">None performed.</p>
                    ) : (
                      <ul className="mt-1 grid gap-1">
                        {doc.analysis.consistency.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Badge
                              tone={
                                c.status === "consistent" ? "green" : c.status === "inconsistent" ? "orange" : "neutral"
                              }
                            >
                              {c.status}
                            </Badge>
                            <span>
                              <span className="font-medium">{c.field}</span> — {c.observation}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Anomalies</p>
                    {doc.analysis.anomalies.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        No anomalies observed. This is not a claim of authenticity.
                      </p>
                    ) : (
                      <ul className="mt-1 grid gap-1">
                        {doc.analysis.anomalies.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Badge tone={severityTone(a.severity)}>{a.kind}</Badge>
                            <span>{a.observation}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {doc.analysis.ocr_text ? (
                  <details className="sm:col-span-2">
                    <summary className="cursor-pointer text-xs text-muted">OCR text</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-muted">
                      {doc.analysis.ocr_text}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
