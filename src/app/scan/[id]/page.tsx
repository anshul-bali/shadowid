"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { Badge, Button, Card, ErrorState, Spinner } from "@/components/ui";
import type { ScanRow } from "@/lib/types";

const STAGES = [
  { key: "collecting", label: "Collecting public evidence", detail: "Submitted profiles + Tavily + GitHub/Wikipedia/HN/OpenAlex · saving URLs, titles, excerpts, retrieval times" },
  { key: "researching", label: "Research Agent", detail: "Google AI extracts identity signals — each must cite saved evidence" },
  { key: "matching", label: "Match Agent", detail: "Google AI checks whether evidence likely belongs to the submitted identity" },
  { key: "reporting", label: "Report Agent + Shadow Score", detail: "Report Agent explains supported risks · server code computes the experimental score" },
] as const;

export default function ScanProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scans/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data.error ?? "Failed to load scan");
      return null;
    }
    setScan(data.scan as ScanRow);
    setReportId(data.report_id ?? null);
    return data.scan as ScanRow;
  }, [id]);

  const drive = useCallback(
    async (fromRetry: boolean) => {
      setRunning(true);
      setLoadError(null);
      try {
        let current = fromRetry ? await load() : scan;
        for (let i = 0; i < 6; i++) {
          if (abortRef.current) return;
          const res = await fetch(`/api/scans/${id}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setLoadError(data.error ?? "Scan run request failed");
            await load();
            return;
          }
          setScan(data.scan as ScanRow);
          current = data.scan as ScanRow;
          if (data.done || current.status === "completed" || current.status === "failed") {
            await load();
            return;
          }
        }
      } finally {
        setRunning(false);
      }
    },
    [id, load, scan]
  );

  useEffect(() => {
    abortRef.current = false;
    (async () => {
      const loaded = await load();
      if (!loaded) return;
      if (loaded.status === "pending" || loaded.status === "running" || loaded.status === "failed") {
        // failed scans re-drive only via the explicit Retry button
        if (loaded.status !== "failed") void drive(false);
      }
    })();
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError && !scan) return <div className="mx-auto max-w-2xl px-4 py-10"><ErrorState message={loadError} onRetry={() => void load()} /></div>;

  if (!scan) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-16 text-muted">
        <Spinner className="text-accent" /> Loading scan…
      </div>
    );
  }

  const activeIndex = STAGES.findIndex((s) => s.key === scan.stage);
  const failed = scan.status === "failed";
  const completed = scan.status === "completed";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Scan: {scan.subject_name}</h1>
          <p className="text-sm text-muted">
            Started {new Date(scan.created_at).toLocaleString()} · live backend run, progress saved at every stage
          </p>
        </div>
        {completed ? <Badge tone="green">Completed</Badge> : failed ? <Badge tone="red">Failed</Badge> : <Badge tone="violet">Running</Badge>}
      </div>

      <Card className="mt-6">
        <ol className="flex flex-col gap-4">
          {STAGES.map((stage, i) => {
            const state = completed ? "done" : failed
              ? i < activeIndex ? "done" : i === activeIndex ? "failed" : "todo"
              : i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
            return (
              <li key={stage.key} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs">
                  {state === "done" ? (
                    <span className="text-emerald-400">✓</span>
                  ) : state === "failed" ? (
                    <span className="text-red-400">✕</span>
                  ) : state === "active" ? (
                    <Spinner className="size-3 text-accent" />
                  ) : (
                    <span className="text-muted">{i + 1}</span>
                  )}
                </span>
                <div>
                  <p className={state === "todo" ? "text-sm text-muted" : "text-sm font-medium"}>{stage.label}</p>
                  <p className="text-xs text-muted">{stage.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {!completed && !failed ? (
          <p className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
            <Spinner className="size-3 text-accent" />
            {scan.stage_detail ?? "Working…"} This usually takes 1–2 minutes in total.
          </p>
        ) : null}
      </Card>

      {failed ? (
        <Card className="mt-4 border-red-500/30 bg-red-500/5">
          <p className="text-sm font-medium text-red-400">The scan failed — nothing was fabricated.</p>
          <p className="mt-1 break-words text-sm text-muted">{scan.error}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void drive(true)} disabled={running}>
              {running ? <Spinner /> : null} Retry scan
            </Button>
            <Button href="/dashboard" variant="secondary">Back to dashboard</Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Retrying clears the partial output of the failed step and resumes from it — saved evidence
            from completed steps is kept.
          </p>
        </Card>
      ) : null}

      {completed && reportId ? (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-400">
            Scan complete{scan.shadow_score !== null ? ` — experimental Shadow Score: ${scan.shadow_score}/100` : ""}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button href={`/reports/${reportId}`}>View saved report</Button>
            <Button href="/dashboard" variant="secondary">Dashboard</Button>
          </div>
        </Card>
      ) : null}

      <p className="mt-6 text-center text-xs text-muted">
        <Link href="/dashboard" className="underline">Back to dashboard</Link>
      </p>
    </div>
  );
}
