// Local preview keeps its original backend. The Pages build injects cloud settings.
const meta = document.querySelector('meta[name="portfolio-cloud"]');
export const cloud = meta ? JSON.parse(meta.content) : null;
export const base = cloud?.base || '';
export function sitePath(path) {
  if (!cloud) return path;
  const u = new URL(path, location.origin);
  if (u.pathname.startsWith('/works/')) {
    u.searchParams.set('work', decodeURIComponent(u.pathname.slice(7)));
    u.pathname = base + '/works/';
  } else u.pathname = base + (u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, '') + '/');
  return u.pathname + u.search + u.hash;
}
export function pagePath() {
  if (!cloud) return location.pathname;
  const path = location.pathname.slice(base.length).replace(/\/$/, '') || '/';
  const id = new URLSearchParams(location.search).get('work');
  return path === '/works' && id ? '/works/' + encodeURIComponent(id) : path;
}
export async function api(path, body) {
  if (cloud) return (await import('./supabase-api.js')).cloudApi(path, body);
  const r = await fetch(path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const value = await r.json();
  if (!r.ok) throw Error(value.error || '操作失敗');
  return value;
}
