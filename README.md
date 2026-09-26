# ShadowID

Consent-gated, evidence-first identity-exposure scanner. ShadowID searches **public** web sources for an identity you own (or are authorized to submit) and shows what is exposed, what connects across sources, and what may look like impersonation. Every finding cites saved evidence; nothing is fabricated, and uncertain matches are flagged for human review.

**Live (production):** https://shadowid-xi.vercel.app

## How it works

1. **Consent & submit** — you enter your own name, handles, and profile links and explicitly consent to a public-source search. No scan runs without consent.
2. **Evidence collection** — server-side Tavily search plus key-free OSINT collectors (GitHub, Wikipedia, Hacker News, OpenAlex, direct profile fetches). Each query, URL, title, retrieval time, excerpt, and outcome is saved. "No result" is never treated as proof of no exposure.
3. **Three focused agents** — a Research Agent extracts identity signals, a Match Agent classifies each page (Confirmed / Possible / Rejected) requiring quoted evidence, and a Report Agent explains supported risks. Text generation uses Google AI with a DeepSeek → Groq fallback chain; document OCR/vision uses Google AI.
4. **Experimental Shadow Score** — a deterministic, auditable server calculation (not AI) combining reviewed exposure, cross-source connections, impersonation indicators, and document anomalies. Only **confirmed** pages count toward the score until you review the rest.

Findings are evidence for human review, never confirmed accusations. Impersonation is always "possible, pending review."

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Auth / DB / Storage:** Supabase (cookie sessions, Postgres + RLS, private `documents` bucket)
- **AI / Search:** Google AI (Gemini), DeepSeek, Groq, OpenAI-compatible fallbacks, Tavily
- **Hosting:** Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

Apply the database schema (reads `DATABASE_URL` from `.env.local`):

```bash
node scripts/apply-schema.mjs
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin client — never expose |
| `GOOGLE_AI_API_KEY` | Gemini (Research/Match/vision) |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` | DeepSeek text fallback |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI-compatible slot (pointed at Groq) + final text fallback |
| `TAVILY_API_KEY` | Web search |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME` | App URL / name |
| `DATABASE_URL` | Scripts only (schema apply) |

## Deployment

Deployed on Vercel and connected to this GitHub repository — pushes to `main` auto-deploy to production; other branches/PRs create preview deployments. `vercel.json` pins the Next.js framework. All secrets are set as Vercel production environment variables (never committed).

## Disclaimer

Experimental tool. Scans only run on identities you own or are authorized to submit. Document checks describe anomalies only — never whether a document is authentic or fraudulent.
