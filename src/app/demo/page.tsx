import { Badge, Button, Card, ScoreDial, severityTone } from "@/components/ui";

// Synthetic demo data — hard-coded, clearly labeled, and fully isolated from live scans.
// Nothing on this page reads from or writes to the database.

const demo = {
  subject: "Jordan A. Example",
  score: 46,
  summary:
    "Jordan's professional identity is well represented online, but a personal blog and a photo-sharing profile expose a home city and reusable handle, and one lookalike profile may be impersonating them.",
  breakdown: {
    exposure: 55,
    connections: 40,
    impersonation: 45,
    documents: 0,
  },
  findings: [
    {
      agent: "research",
      type: "Exposure",
      severity: "medium",
      confidence: 0.82,
      title: "Home city disclosed on personal blog",
      description:
        "A personal blog post from 2024 mentions the author's neighborhood and daily commute, which narrows physical location.",
      evidence: "jordanexample.blog/about",
      needsReview: false,
    },
    {
      agent: "research",
      type: "Identity signal",
      severity: "low",
      confidence: 0.91,
      title: "Handle reuse across four services",
      description:
        "The same handle 'jexample94' appears on a photo site, a forum, a code host, and a gaming platform, making cross-service correlation easy.",
      evidence: "pix.example/u/jexample94 · forum.example/@jex94",
      needsReview: false,
    },
    {
      agent: "match",
      type: "Cross-source link",
      severity: "medium",
      confidence: 0.77,
      title: "LinkedIn ↔ GitHub ↔ blog tied by name and photo",
      description:
        "The same full name plus a matching profile photo connects three otherwise separate accounts into one identity graph.",
      evidence: "linked.example/in/jordanexample · git.example/jexample94",
      needsReview: false,
    },
    {
      agent: "match",
      type: "Possible impersonation",
      severity: "high",
      confidence: 0.64,
      title: "Lookalike profile 'JordanExample_Official' on a social network",
      description:
        "An account created recently uses a similar name, the same profile photo, and a bio copied from the submitted LinkedIn — but posts unrelated promotional links. This is an indication for human review, not a confirmed accusation. Conflicting details: different location and link-in-bio domain.",
      evidence: "social.example/JordanExample_Official",
      needsReview: true,
      matching: "Same photo · same name pattern · copied bio",
      conflicting: "Different city · unrelated external links",
    },
  ],
  actions: [
    { priority: "high", title: "Review the lookalike profile", detail: "Open the cited URL, compare content, and use the platform's impersonation report flow if it is not yours." },
    { priority: "medium", title: "Reduce location detail on the blog", detail: "Remove or generalize neighborhood and commute references." },
    { priority: "medium", title: "Vary reusable handles", detail: "Where practical, use distinct handles per service to slow cross-service correlation." },
    { priority: "low", title: "Re-scan after changes", detail: "Run a fresh live scan to confirm your footprint changed as expected." },
  ],
  evidence: [
    { title: "Jordan Example — LinkedIn (public view)", url: "linked.example/in/jordanexample", retrieved: "2026-09-01 10:02 UTC" },
    { title: "jexample94 on PixExample", url: "pix.example/u/jexample94", retrieved: "2026-09-01 10:02 UTC" },
    { title: "About me — jordanexample.blog", url: "jordanexample.blog/about", retrieved: "2026-09-01 10:03 UTC" },
    { title: "JordanExample_Official profile", url: "social.example/JordanExample_Official", retrieved: "2026-09-01 10:03 UTC" },
  ],
};

export const metadata = { title: "Demo (synthetic)" };

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-center">
        <p className="font-bold text-yellow-400">SYNTHETIC DEMO — NOT REAL DATA</p>
        <p className="mt-1 text-sm text-muted">
          Everything below is hard-coded fiction about a made-up person. It never touches live scans, the
          database, or any external API. For real results, run a consent-based live scan on your own identity.
        </p>
        <div className="mt-3 flex justify-center gap-3">
          <Button href="/sign-up">Try a live scan</Button>
          <Button href="/" variant="secondary">Judge guide</Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Demo report</p>
          <h1 className="text-2xl font-bold">{demo.subject}</h1>
          <p className="mt-1 text-sm text-muted">Scanned 2026-09-01 · synthetic run</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ScoreDial score={demo.score} />
          <Badge tone="violet">Shadow Score · EXPERIMENTAL · synthetic</Badge>
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        <p className="mt-2 text-sm leading-relaxed">{demo.summary}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Score factors (synthetic)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Reviewed exposure", demo.breakdown.exposure, 35],
              ["Cross-source connections", demo.breakdown.connections, 20],
              ["Impersonation indicators", demo.breakdown.impersonation, 30],
              ["Document anomalies", demo.breakdown.documents, 15],
            ] as const
          ).map(([label, value, weight]) => (
            <div key={label}>
              <div className="flex justify-between text-xs">
                <span className="text-muted">{label} · weight {weight}%</span>
                <span className="font-medium">{value}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Findings ({demo.findings.length})</h2>
        <div className="mt-3 grid gap-3">
          {demo.findings.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="violet">{f.type}</Badge>
                <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                <Badge tone="neutral">confidence {(f.confidence * 100).toFixed(0)}%</Badge>
                <Badge tone="neutral">{f.agent} agent</Badge>
                {f.needsReview ? <Badge tone="yellow">uncertain — flagged for review</Badge> : null}
              </div>
              <p className="mt-2 text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.description}</p>
              {"matching" in f ? (
                <p className="mt-2 text-xs text-muted">
                  <span className="text-emerald-400">Shared:</span> {f.matching} ·{" "}
                  <span className="text-orange-400">Conflicts:</span> {f.conflicting}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-accent">🔗 {f.evidence}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Recommended actions</h2>
        <ul className="mt-3 grid gap-3">
          {demo.actions.map((a, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <Badge tone={severityTone(a.priority)}>{a.priority}</Badge>
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="mt-0.5 text-sm text-muted">{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Source evidence (synthetic)</h2>
        <ul className="mt-3 grid gap-2">
          {demo.evidence.map((e, i) => (
            <li key={i} className="rounded-lg border border-border bg-background p-3 text-sm">
              <span className="font-medium">{e.title}</span>
              <span className="ml-2 text-xs text-muted">{e.url} · retrieved {e.retrieved}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Demo URLs use reserved <code>.example</code> domains and are not real pages.
        </p>
      </Card>

      <p className="mt-8 text-center text-sm text-muted">
        Ready for the real thing?{" "}
        <a href="/sign-up" className="text-accent underline">Create an account</a> and run a live scan on
        your own identity — it takes about 1–2 minutes and saves a real report you can return to.
      </p>
    </div>
  );
}
