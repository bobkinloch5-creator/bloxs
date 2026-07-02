// Lightweight web research helpers for the BloxSmith AI.
// No third-party API key required — uses DuckDuckGo's HTML endpoint
// (server-friendly) for search and plain fetch for page reads.
// Prioritizes official Roblox sources: create.roblox.com, devforum, luau-lang.org.

const UA =
  "Mozilla/5.0 (compatible; BloxSmithBot/1.0; +https://bloxsmith.pro)";

const PRIMARY_SITES = [
  "create.roblox.com",
  "devforum.roblox.com",
  "luau-lang.org",
  "github.com/Roblox",
];

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchRoblox(query: string, limit = 6): Promise<SearchHit[]> {
  const siteFilter = PRIMARY_SITES.map((s) => `site:${s}`).join(" OR ");
  const q = `${query} (${siteFilter})`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  } catch (e) {
    return [];
  }
  if (!res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  // DDG HTML: each result wrapped in <a class="result__a" href="…">title</a> + <a class="result__snippet">…</a>
  const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:result__snippet[^>]*>([\s\S]*?)<\/a>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) && hits.length < limit) {
    let rawUrl = m[1];
    // DDG wraps real URL in /l/?uddg=
    const uddg = rawUrl.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try { rawUrl = decodeURIComponent(uddg[1]); } catch {}
    }
    if (!/^https?:\/\//i.test(rawUrl)) continue;
    if (!PRIMARY_SITES.some((s) => rawUrl.includes(s))) continue;
    hits.push({
      url: rawUrl,
      title: stripTags(m[2]).slice(0, 200),
      snippet: stripTags(m[3] ?? "").slice(0, 400),
    });
  }
  return hits;
}

export async function fetchDocPage(url: string, maxChars = 8000): Promise<{ url: string; title: string; text: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  // Only allow trusted Roblox/Luau sources to avoid arbitrary fetches.
  if (!PRIMARY_SITES.some((s) => url.includes(s))) {
    return { url, title: "blocked", text: "URL is not on an allowed Roblox source. Pass an URL from create.roblox.com, devforum.roblox.com, luau-lang.org, or github.com/Roblox." };
  }
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = stripTags(titleMatch?.[1] ?? "").slice(0, 200);
  // Prefer <main> or <article> content when present.
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0]
    ?? html;
  const text = stripTags(main).slice(0, maxChars);
  return { url, title, text };
}
