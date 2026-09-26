import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, EmptyState, scoreTone } from "@/components/ui";
import type { ReportRow, ScanRow } from "@/lib/types";

export const metadata = { title: "Reports" };

interface ReportWithScan extends ReportRow {
  scans: Pick<ScanRow, "subject_name"> | null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ scan?: string }>;
}) {
  const { scan: scanFilter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/reports");

  let query = supabase
    .from("reports")
    .select("*, scans(subject_name)")
    .order("created_at", { ascending: false });
  if (scanFilter) query = query.eq("scan_id", scanFilter);

  const { data, error } = await query;
  const reports = (data ?? []) as unknown as ReportWithScan[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Saved reports</h1>
          <p className="text-sm text-muted">Every completed live scan saves exactly one report here.</p>
        </div>
        <Button href="/scan/new">New scan</Button>
      </div>

      <div className="mt-8">
        {error ? (
          <Card className="border-red-500/30">
            <p className="text-sm text-red-400">Could not load reports: {error.message}</p>
          </Card>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Reports appear here after a live scan completes. Nothing is pre-populated or fabricated."
            action={<Button href="/scan/new">Run your first scan</Button>}
          />
        ) : (
          <div className="grid gap-3">
            {reports.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link href={`/reports/${r.id}`} className="font-medium hover:text-accent">
                    {r.scans?.subject_name ?? "Unknown subject"}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    {r.narrative_error ? <Badge tone="orange">Report Agent failed — retry inside</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-1 max-w-xl text-sm text-muted">{r.summary}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xl font-bold">{r.shadow_score}</div>
                    <Badge tone={scoreTone(r.shadow_score)}>experimental</Badge>
                  </div>
                  <Button href={`/reports/${r.id}`} variant="secondary">Open</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
