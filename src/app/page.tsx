import { Badge, Button, Card } from "@/components/ui";

const steps = [
  {
    title: "1. Consent & submit",
    body: "You enter your own name, handles, and profile links — and explicitly consent to a public-source search. No scan runs without consent.",
  },
  {
    title: "2. Evidence collection",
    body: "A server-side Tavily search retrieves relevant public pages. Every source URL, title, retrieval time, and excerpt is saved as evidence.",
  },
  {
    title: "3. Three focused agents",
    body: "A Research Agent extracts identity signals (Google AI), a Match Agent checks whether evidence likely belongs to you, and a Report Agent explains supported risks (OpenAI). Every finding cites saved evidence.",
  },
  {
    title: "4. Experimental Shadow Score",
    body: "A deterministic, auditable server calculation — not AI — combines exposure, cross-source connections, impersonation indicators, and document anomalies into a provisional score with visible factors and uncertainty.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-20 text-center">
        <Badge tone="violet" className="mb-4">
          Experimental · evidence-first identity review
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Know your <span className="text-accent">public footprint</span> before someone else maps it
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          ShadowID scans public web sources for your own identity — with your consent — and shows what
          is exposed, what connects across sources, and what may look like impersonation. Every finding
          cites saved evidence. Nothing is fabricated; uncertain matches are flagged for human review.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/sign-up">Create an account</Button>
          <Button href="/demo" variant="secondary">
            View synthetic demo
          </Button>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.title}>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="pb-20">
        <Card className="border-accent/30 bg-accent/5">
          <h2 className="text-lg font-semibold">Judge guide: try a live scan</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              <span className="text-foreground font-medium">Create an account</span> — sign up with any
              email and a password (no email confirmation needed).
            </li>
            <li>
              <span className="text-foreground font-medium">Start a new scan</span> — enter{" "}
              <span className="text-foreground">your own</span> name, social handles, and profile links.
              Read the consent statement and check the box; the form is blocked until you consent.
            </li>
            <li>
              <span className="text-foreground font-medium">Watch it run live</span> — expect roughly{" "}
              <span className="text-foreground">1–2 minutes</span>: a real Tavily search, two Google AI
              agent passes, and an OpenAI report. Progress is saved step by step.
            </li>
            <li>
              <span className="text-foreground font-medium">Open the saved report</span> — Shadow Score
              (experimental), factors, evidence links, uncertainty notes, and recommended actions. Sign
              out and back in: the report is still there, and you will only ever see your own records.
            </li>
            <li>
              <span className="text-foreground font-medium">Optional: document check</span> — upload a
              document of yours on the report page for OCR, field-consistency, and metadata observations
              (anomalies only — never a verdict of authenticity), then delete it if you like.
            </li>
          </ol>
          <p className="mt-4 text-xs text-muted">
            Prefer not to share details? The <a href="/demo" className="text-accent underline">/demo</a>{" "}
            page shows a fully synthetic example, clearly labeled and isolated from live scans.
          </p>
        </Card>
      </section>
    </div>
  );
}
