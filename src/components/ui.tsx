import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Button({
  children,
  href,
  variant = "primary",
  className,
  ...props
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-accent text-white hover:bg-accent/90",
    variant === "secondary" && "border border-border bg-card text-foreground hover:bg-border/50",
    variant === "ghost" && "text-muted hover:bg-card hover:text-foreground",
    variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
    className
  );
  if (href) {
    return (
      <Link href={href} className={styles}>
        {children}
      </Link>
    );
  }
  return (
    <button className={styles} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>{children}</div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "yellow" | "orange" | "red" | "violet";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-zinc-500/15 text-zinc-300",
        tone === "green" && "bg-emerald-500/15 text-emerald-400",
        tone === "yellow" && "bg-yellow-500/15 text-yellow-400",
        tone === "orange" && "bg-orange-500/15 text-orange-400",
        tone === "red" && "bg-red-500/15 text-red-400",
        tone === "violet" && "bg-violet-500/15 text-violet-300",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
      aria-label="Loading"
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-accent/10 text-lg text-accent">
        ○
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
      <p className="text-sm font-medium text-red-400">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted">
      <Spinner className="text-accent" />
      {label}
    </div>
  );
}

export function severityTone(severity: string) {
  switch (severity) {
    case "critical":
      return "red" as const;
    case "high":
      return "orange" as const;
    case "medium":
      return "yellow" as const;
    default:
      return "green" as const;
  }
}

export function scoreTone(score: number) {
  if (score >= 70) return "red" as const;
  if (score >= 40) return "orange" as const;
  if (score >= 20) return "yellow" as const;
  return "green" as const;
}

export function ScoreDial({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? "#f87171" : score >= 40 ? "#fb923c" : score >= 20 ? "#facc15" : "#34d399";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold" style={{ color }}>
          {score}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted">/ 100</div>
      </div>
    </div>
  );
}
