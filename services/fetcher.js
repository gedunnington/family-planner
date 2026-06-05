import { parse } from 'node-html-parser';

export async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyPlanner/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  const root = parse(html);
  root.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
  return root.text.replace(/\s+/g, ' ').trim().slice(0, 8000);
}
