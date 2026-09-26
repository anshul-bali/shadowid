import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, EmptyState, scoreTone } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";
import type { ScanRow } from "@/lib/types";

export const metadata = { title: "Dashboard" };

const STAGE_COPY: Record<string, string> = {
  queued: "Queued",
  collecting: "Collecting evidence",
  researching: "Research Agent running",
  matching: "Match Agent running",
  reporting: "Report Agent running",
  done: "Completed",
  failed: "Failed",
};

function statusBadge(scan: ScanRow) {
  if (scan.status === "completed") return <Badge tone="green">Completed</Badge>;
  if (scan.status === "failed") return <Badge tone="red">Failed</Badge>;
  if (scan.status === "running") return <Badge tone="violet">{STAGE_COPY[scan.stage] ?? "Running"}</Badge>;
  return <Badge tone="yellow">Pending</Badge>;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/dashboard");

  const { data: scans, error } = await supabase
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted">
            Signed in as {user.email} — you only see your own scans and reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button href="/scan/new">New scan</Button>
          <SignOutButton />
        </div>
      </div>

      <div className="mt-8">
        {error ? (
          <Card className="border-red-500/30">
            <p className="text-sm text-red-400">Could not load your scans: {error.message}</p>
          </Card>
        ) : !scans || scans.length === 0 ? (
          <EmptyState
            title="No scans yet"
            description="Run your first consent-based scan to see what public sources say about your identity. It takes about 1–2 minutes."
            action={<Button href="/scan/new">Start a scan</Button>}
          />
        ) : (
          <div className="grid gap-3">
            {scans.map((raw) => {
              const scan = raw as ScanRow;
              return (
                <Card key={scan.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <Link
                      href={scan.status === "completed" ? `/reports?scan=${scan.id}` : `/scan/${scan.id}`}
                      className="truncate font-medium hover:text-accent"
                    >
                      {scan.subject_name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {statusBadge(scan)}
                      <span>{new Date(scan.created_at).toLocaleString()}</span>
                      {scan.status === "failed" ? (
                        <Link href={`/scan/${scan.id}`} className="text-red-400 underline">
                          view error / retry
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {scan.shadow_score !== null ? (
                      <div className="text-right">
                        <div className="text-lg font-bold">{scan.shadow_score}</div>
                        <Badge tone={scoreTone(scan.shadow_score)}>experimental score</Badge>
                      </div>
                    ) : null}
                    {scan.status === "completed" ? (
                      <ScanReportLink scanId={scan.id} supabaseClient={supabase} />
                    ) : (
                      <Button href={`/scan/${scan.id}`} variant="secondary">
                        {scan.status === "failed" ? "Retry" : "Open"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

async function ScanReportLink({
  scanId,
  supabaseClient,
}: {
  scanId: string;
  supabaseClient: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: report } = await supabaseClient
    .from("reports")
    .select("id")
    .eq("scan_id", scanId)
    .maybeSingle();
  if (!report) return null;
  return (
    <Button href={`/reports/${report.id}`} variant="secondary">
      View report
    </Button>
  );
}
