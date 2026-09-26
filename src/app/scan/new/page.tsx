"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Spinner } from "@/components/ui";
import { CONSENT_STATEMENT } from "@/lib/consent";

export default function NewScanPage() {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consented) {
      setError("You must check the consent box before running a scan.");
      return;
    }
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const handles = String(form.get("handles") ?? "")
      .split(/[\n,]/)
      .map((h) => h.trim().replace(/^@/, ""))
      .filter(Boolean)
      .slice(0, 10);
    const profileLinks = String(form.get("profile_links") ?? "")
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);

    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject_name: String(form.get("subject_name") ?? "").trim(),
        handles,
        profile_links: profileLinks,
        context: String(form.get("context") ?? "").trim() || null,
        consent_granted: consented,
        consent_statement: CONSENT_STATEMENT,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.scan) {
      setError(data.error ?? "Failed to create scan");
      setLoading(false);
      return;
    }
    router.push(`/scan/${data.scan.id}`);
  }

  const inputCls =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">New scan</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your own details (or details you are authorized to submit). ShadowID searches only public
        web sources and saves every result as evidence.
      </p>

      <Card className="mt-6 border-accent/30 bg-accent/5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-1 size-4 accent-violet-500"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">Consent (required).</span>{" "}
            <span className="text-muted">{CONSENT_STATEMENT}</span>
          </span>
        </label>
      </Card>

      <Card className="mt-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            Full name <span className="text-red-400">*</span>
            <input
              name="subject_name"
              required
              minLength={2}
              maxLength={120}
              disabled={!consented}
              className={inputCls}
              placeholder="e.g. Alex Morgan"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Handles / usernames <span className="text-muted">(one per line, optional)</span>
            <textarea
              name="handles"
              rows={3}
              disabled={!consented}
              className={inputCls}
              placeholder={"alexm\ngithub.com/alexm"}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Profile links <span className="text-muted">(one URL per line, optional)</span>
            <textarea
              name="profile_links"
              rows={3}
              disabled={!consented}
              className={inputCls}
              placeholder={"https://linkedin.com/in/alexmorgan\nhttps://x.com/alexm"}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Additional context <span className="text-muted">(optional — helps disambiguate)</span>
            <input
              name="context"
              maxLength={1000}
              disabled={!consented}
              className={inputCls}
              placeholder="e.g. software engineer based in Berlin"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Expected run time: about 1–2 minutes.</p>
            <Button type="submit" disabled={loading || !consented}>
              {loading ? <Spinner /> : null} Run scan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
