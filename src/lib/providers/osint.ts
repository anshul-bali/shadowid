// Key-free public-source OSINT collectors. Every lookup is best-effort: a source
// that errors or rate-limits contributes nothing rather than failing the scan.
// All outbound fetches go through safeFetch, which blocks private/loopback hosts
// and non-standard ports so user-submitted profile links cannot be used for SSRF.

export interface OsintHit {
  url: string;
  title: string;
  excerpt: string;
  source_type: string;
  query: string;
}

const UA = "ShadowID-OSINT/1.0 (+consent-based identity exposure review)";
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = +v4[1];
    const b = +v4[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169) return true; // 169.254 link-local and friends
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^f[cd]/.test(h)) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    return false;
  }
  return false;
}

async function safeFetch(url: string, headers: Record<string, string> = {}): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPrivateHostname(u.hostname)) return null;
    if (u.port && u.port !== "80" && u.port !== "443") return null;
    const res = await fetch(u.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "*/*", ...headers },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  return null;
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attr: string, value: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${value}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decode(m[1]);
  }
  return null;
}

// Retrieve a user-submitted profile page and summarise it as evidence.
export async function fetchProfileHit(url: string): Promise<OsintHit | null> {
  try {
    const res = await safeFetch(url);
    if (!res || !res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = stripTags(titleMatch?.[1] ?? "").slice(0, 200) || url;
    const description =
      metaContent(html, "property", "og:description") ??
      metaContent(html, "name", "description") ??
      "";
    const excerpt = (description || stripTags(html).slice(0, 600)).slice(0, 900);
    return { url, title, excerpt, source_type: "profile", query: "submitted profile link" };
  } catch {
    return null;
  }
}

export async function githubUserHit(handle: string): Promise<OsintHit | null> {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37})$/.test(clean)) return null;
  try {
    const res = await safeFetch(`https://api.github.com/users/${encodeURIComponent(clean)}`, {
      accept: "application/vnd.github+json",
    });
    if (!res || !res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    const parts = [
      d.name ? `name: ${d.name}` : null,
      d.bio ? `bio: ${d.bio}` : null,
      d.company ? `company: ${d.company}` : null,
      d.location ? `location: ${d.location}` : null,
      d.blog ? `blog: ${d.blog}` : null,
      typeof d.public_repos === "number" ? `public_repos: ${d.public_repos}` : null,
      typeof d.followers === "number" ? `followers: ${d.followers}` : null,
      d.created_at ? `joined: ${d.created_at}` : null,
    ].filter(Boolean);
    return {
      url: String(d.html_url ?? `https://github.com/${clean}`),
      title: `GitHub profile: ${clean}`,
      excerpt: parts.join(" · ").slice(0, 900),
      source_type: "github",
      query: `github user ${clean}`,
    };
  } catch {
    return null;
  }
}

export async function hackerNewsHits(name: string): Promise<OsintHit[]> {
  try {
    const res = await safeFetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(name)}&hitsPerPage=3&tags=story`
    );
    if (!res || !res.ok) return [];
    const d = (await res.json()) as { hits?: Record<string, unknown>[] };
    return (d.hits ?? []).flatMap((h) => {
      const objectID = String(h.objectID ?? "");
      const url = String(h.url ?? "") || (objectID ? `https://news.ycombinator.com/item?id=${objectID}` : "");
      const title = String(h.title ?? "");
      if (!url || !title) return [];
      return [
        {
          url,
          title: title.slice(0, 200),
          excerpt: `Hacker News story · ${h.points ?? 0} points · ${h.num_comments ?? 0} comments · ${h.created_at ?? ""}`.slice(0, 400),
          source_type: "hackernews",
          query: `hackernews ${name}`,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function wikipediaHits(name: string): Promise<OsintHit[]> {
  try {
    const res = await safeFetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(name)}`
    );
    if (!res || !res.ok) return [];
    const d = (await res.json()) as { query?: { search?: { title: string; snippet: string; pageid: number }[] } };
    return (d.query?.search ?? []).map((s) => ({
      url: `https://en.wikipedia.org/?curid=${s.pageid}`,
      title: s.title.slice(0, 200),
      excerpt: stripTags(s.snippet).slice(0, 600),
      source_type: "wikipedia",
      query: `wikipedia ${name}`,
    }));
  } catch {
    return [];
  }
}

export async function openAlexHits(name: string): Promise<OsintHit[]> {
  try {
    const res = await safeFetch(
      `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per-page=3`
    );
    if (!res || !res.ok) return [];
    const d = (await res.json()) as {
      results?: {
        display_name?: string;
        works_count?: number;
        cited_by_count?: number;
        orcid?: string | null;
        id?: string;
        last_known_institutions?: { display_name?: string }[];
      }[];
    };
    return (d.results ?? []).flatMap((a) => {
      const url = a.orcid || a.id;
      if (!url || !a.display_name) return [];
      const insts = (a.last_known_institutions ?? [])
        .map((i) => i.display_name)
        .filter(Boolean)
        .join(", ");
      return [
        {
          url,
          title: `OpenAlex author: ${a.display_name}`.slice(0, 200),
          excerpt: `${a.works_count ?? 0} works · ${a.cited_by_count ?? 0} citations${insts ? ` · institutions: ${insts}` : ""}`.slice(0, 600),
          source_type: "openalex",
          query: `openalex ${name}`,
        },
      ];
    });
  } catch {
    return [];
  }
}

// Run all auxiliary lookups concurrently; each is independent and best-effort.
// Returns the hits plus a per-source retrieval log so the pipeline can record
// which sources were searched and whether each returned results, was empty, or
// failed — "no result" is logged, never silently dropped.
export interface OsintLogEntry {
  source: string;
  query: string;
  result_count: number;
  outcome: "ok" | "empty" | "failed";
  detail?: string;
}

export interface AuxOsintResult {
  hits: OsintHit[];
  log: OsintLogEntry[];
}

export async function collectAuxOsint(name: string, handles: string[]): Promise<AuxOsintResult> {
  const sources: { source: string; query: string; run: () => Promise<OsintHit[] | OsintHit | null> }[] = [
    { source: "hackernews", query: name, run: () => hackerNewsHits(name) },
    { source: "wikipedia", query: name, run: () => wikipediaHits(name) },
    { source: "openalex", query: name, run: () => openAlexHits(name) },
    ...handles.slice(0, 3).map((h) => ({
      source: "github",
      query: h,
      run: () => githubUserHit(h),
    })),
  ];

  const settled = await Promise.allSettled(sources.map((s) => s.run()));
  const hits: OsintHit[] = [];
  const log: OsintLogEntry[] = [];
  settled.forEach((s, i) => {
    const src = sources[i];
    if (s.status !== "fulfilled") {
      log.push({ source: src.source, query: src.query, result_count: 0, outcome: "failed", detail: String(s.reason).slice(0, 200) });
      return;
    }
    const value = s.value;
    const found = Array.isArray(value) ? value : value ? [value] : [];
    hits.push(...found);
    log.push({
      source: src.source,
      query: src.query,
      result_count: found.length,
      outcome: found.length > 0 ? "ok" : "empty",
    });
  });
  return { hits, log };
}
