"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Spinner } from "@/components/ui";
import type { EvidenceRow, MatchStatus } from "@/lib/types";

const STATUS_TONE: Record<MatchStatus, "green" | "yellow" | "red" | "neutral"> = {
  confirmed: "green",
  possible: "yellow",
  rejected: "red",
  unreviewed: "neutral",
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  confirmed: "Confirmed match",
  possible: "Possible match",
  rejected: "Rejected",
  unreviewed: "Unreviewed",
};

const OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "confirmed", label: "Confirm" },
  { value: "possible", label: "Possible" },
  { value: "rejected", label: "Reject" },
];

export function EvidenceReview({ evidence }: { evidence: EvidenceRow[] }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, MatchStatus>>(
    Object.fromEntries(evidence.map((e) => [e.id, e.match_status]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: MatchStatus) {
    if (statuses[id] === status) return;
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/evidence/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_status: status }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Could not save your correction");
      return;
    }
    setStatuses((prev) => ({ ...prev, [id]: status }));
    router.refresh(); // re-render the server-side Shadow Score with the new decision
  }

  if (evidence.length === 0) {
    return <p className="mt-2 text-sm text-muted">No public pages were saved for this scan.</p>;
  }

  return (
    <div>
      <p className="mt-1 text-xs text-muted">
        The Match Agent classified each page against your submitted identity, quoting the page as
        evidence. Only <span className="text-emerald-400">confirmed</span> pages count toward the Shadow
        Score — <span className="text-yellow-400">possible</span> and unreviewed pages are excluded until
        you decide. Correct any decision below; the score recomputes immediately.
      </p>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <ul className="mt-3 grid gap-2">
        {evidence.map((e) => {
          const status = statuses[e.id] ?? e.match_status;
          const byUser = e.match_reviewed_by === "user";
          return (
            <li key={e.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {e.title}
                </a>
                <span className="text-xs text-muted">retrieved {new Date(e.retrieved_at).toLocaleString()}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{e.url}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{e.source_type}</Badge>
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                {byUser ? <Badge tone="violet">your correction</Badge> : null}
                {typeof e.match_similarity === "number" ? (
                  <Badge tone="neutral">similarity {(e.match_similarity * 100).toFixed(0)}%</Badge>
                ) : null}
              </div>
              {e.excerpt ? <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{e.excerpt}</p> : null}
              {e.match_quotes?.length ? (
                <p className="mt-1.5 text-xs text-muted">
                  <span className="text-emerald-400">Matching quotes:</span>{" "}
                  {e.match_quotes.map((q, i) => (
                    <span key={i} className="italic">“{q}”{i < e.match_quotes.length - 1 ? " · " : ""}</span>
                  ))}
                </p>
              ) : null}
              {e.match_conflicting?.length ? (
                <p className="mt-1 text-xs text-muted">
                  <span className="text-orange-400">Conflicting:</span>{" "}
                  {e.match_conflicting.map((q, i) => (
                    <span key={i} className="italic">“{q}”{i < e.match_conflicting.length - 1 ? " · " : ""}</span>
                  ))}
                </p>
              ) : null}
              {e.match_notes ? <p className="mt-1 text-xs text-zinc-500">{e.match_notes}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={busyId === e.id}
                    onClick={() => setStatus(e.id, opt.value)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 " +
                      (status === opt.value
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-card text-muted hover:text-foreground")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
                {busyId === e.id ? <Spinner className="text-accent" /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
