import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ShadowID — Know your public footprint", template: "%s · ShadowID" },
  description:
    "Consent-based identity exposure scanning. Find what public sources say about you, review possible impersonation, and get an experimental Shadow Score with evidence.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { user } = await getSession().catch(() => ({ user: null, supabase: null }));

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-accent/20 text-accent">◐</span>
              ShadowID
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/demo" className="rounded-md px-3 py-1.5 text-muted hover:bg-card hover:text-foreground">
                Demo
              </Link>
              {user ? (
                <>
                  <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-muted hover:bg-card hover:text-foreground">
                    Dashboard
                  </Link>
                  <Link href="/reports" className="rounded-md px-3 py-1.5 text-muted hover:bg-card hover:text-foreground">
                    Reports
                  </Link>
                  <Link
                    href="/scan/new"
                    className="ml-1 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent/90"
                  >
                    New scan
                  </Link>
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="ml-1 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent/90"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          ShadowID — experimental tool. Findings are evidence for human review, never confirmed accusations.
          Scans only run on identities you own or are authorized to submit.
        </footer>
      </body>
    </html>
  );
}
