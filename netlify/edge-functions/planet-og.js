// When someone shares a link to their planet (/?p=<id>), give WhatsApp/Instagram/X a
// personal preview card: "Harsh's planet 🪐 · 42 things built". Falls back to the normal page.
const SB_URL = 'https://ycoxfkbgeakwxiqgrvok.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljb3hma2JnZWFrd3hpcWdydm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDY2MzcsImV4cCI6MjExMDY4MjYzN30.FzgDotouST6jUngcnPn3IpTg3S6lBMXDYsI35vTWyto';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async (request, context) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('p');
  const res = await context.next();
  if (!id || !/^[a-z0-9]{6,12}$/.test(id)) return res;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${SB_URL}/rest/v1/planets?select=name,item_count,hearts&id=eq.${id}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: ctl.signal });
    clearTimeout(t);
    const [p] = r.ok ? await r.json() : [];
    if (!p) return res;
    const name = String(p.name || 'A tiny planet').slice(0, 40);
    const n = p.item_count | 0, h = p.hearts | 0;
    const title = `${name} 🪐 come visit my tiny paper planet`;
    const bits = [n ? `${n} little things built` : 'freshly unfolded', h ? `${h} ❤️` : ''].filter(Boolean).join(' · ');
    const desc = `${bits}. Fly over to say hi, then get your own papercraft planet in one tap. Free, no sign-up.`;
    const link = `https://tiny-planets-paper.netlify.app/?p=${id}`;
    let html = await res.text();
    const set = (re, val) => { html = html.replace(re, val); };
    set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    set(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${esc(title)}"`);
    set(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${esc(desc)}"`);
    set(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`);
    set(/(<meta property="og:url" content=")[^"]*"/, `$1${esc(link)}"`);
    const headers = new Headers(res.headers); headers.delete('content-length'); headers.set('cache-control', 'public, max-age=0, must-revalidate');
    return new Response(html, { status: res.status, headers });
  } catch {
    return res;
  }
};

export const config = { path: '/' };
