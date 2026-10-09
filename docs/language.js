const key = 'artist-language';
const valid = value => value === 'zh' || value === 'en';

// Explicit shared URLs choose the initial language. Restored pages follow the
// latest preference instead of bringing stale links back from the page cache.
export function createLanguageState(env, onChange) {
  const stored = () => { try { return env.localStorage.getItem(key); } catch { return null; } };
  const requested = new URL(env.location.href).searchParams.get('lang');
  let current = valid(requested) ? requested : valid(stored()) ? stored() : 'zh';
  function syncUrl() {
    const url = new URL(env.location.href);
    if (url.searchParams.get('lang') === current) return;
    url.searchParams.set('lang', current);
    env.history.replaceState(env.history.state, '', url);
  }
  function remember() { try { env.localStorage.setItem(key, current); } catch {} }
  function select(value) {
    if (!valid(value)) return;
    const changed = current !== value;
    current = value;
    remember();
    syncUrl();
    if (changed) onChange(current);
  }
  function restore() {
    const value = stored();
    if (valid(value) && value !== current) {
      current = value;
      syncUrl();
      onChange(current);
    } else syncUrl();
  }
  remember();
  syncUrl();
  env.addEventListener('pageshow', event => { if (event.persisted) restore(); });
  env.addEventListener('storage', event => { if (event.key === key) restore(); });
  return { get value() { return current; }, select };
}
