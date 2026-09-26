"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";

export function RegenerateNarrative({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/reports/${reportId}/regenerate`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) {
            setError(data.error ?? "Retry failed");
            return;
          }
          router.refresh();
        }}
      >
        {busy ? <Spinner /> : null} Retry Report Agent
      </Button>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
