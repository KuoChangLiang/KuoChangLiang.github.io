import {cloud} from './runtime.js';
const sessionKey = 'portfolio-session-' + new URL(cloud.url).hostname;
const bucket = 'portfolio-media';
let refreshTask;
function readSession() {try {return JSON.parse(sessionStorage.getItem(sessionKey));} catch {return null;}}
function storeSession(value) {
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
}
async function request(path, {method = 'GET', body, token, blob, signal} = {}) {
  const headers = {apikey: cloud.publishableKey};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (blob) headers['Content-Type'] = blob.type || 'application/octet-stream';
  const r = await fetch(cloud.url + path, {method, headers, body: blob || (body === undefined ? undefined : JSON.stringify(body)), signal});
  const raw = await r.text();
  let data; try {data = raw ? JSON.parse(raw) : null;} catch {throw Error('服務回應異常，請稍後重試。');}
  if (!r.ok) {
    const message = path.includes('/token') ? '登入失敗，請確認電子郵件與密碼。' : r.status === 401 ? '登入已逾期，請重新登入。' : r.status === 403 ? '此帳號沒有管理權限。' : data?.message || data?.error_description || data?.error || '操作失敗，請稍後重試。';
    throw Object.assign(Error(message), {status: r.status});
  }
  return data;
}
async function token() {
  let session = readSession();
  if (!session) throw Error('請先登入管理介面。');
  if (session.expires_at * 1000 < Date.now() + 60000) {
    // Serialise refreshes across same-origin preview frames as well as this module.
    const refresh = async () => {
      const current = readSession();
      if (!current) throw Error('請重新登入。');
      if (current.expires_at * 1000 >= Date.now() + 60000) return current;
      try {
        const next = await request('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:current.refresh_token}});
        storeSession(next);return next;
      } catch (e) {if (e.status === 400 || e.status === 401) storeSession(null);throw e;}
    };
    if (!refreshTask) refreshTask = (navigator.locks ? navigator.locks.request(sessionKey, refresh) : refresh()).finally(() => {refreshTask = null;});
    session = await refreshTask;
  }
  return session.access_token;
}
async function rpc(name, body = {}, authenticated = true) {
  return request('/rest/v1/rpc/' + name, {method:'POST', body, token:authenticated ? await token() : undefined});
}
export async function uploadFile(file) {
  if (file.size > 20 * 1024 * 1024) throw Error('圖片上限為 20 MB。');
  const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type];
  if (!ext) throw Error('請使用 JPG、PNG、WebP 或 GIF 圖片。');
  const storage_path = crypto.randomUUID() + '.' + ext;
  await request('/storage/v1/object/' + bucket + '/' + storage_path, {method:'POST', blob:file, token:await token()});
  const media = {storage_path};
  await hydrate([{media:[media]}], true);
  return media;
}
async function hydrate(works, authenticated) {
  const media = works.filter(Boolean).flatMap(w => w.media || []);
  const paths = [...new Set(media.map(m => m.storage_path).filter(Boolean))];
  if (!paths.length) return;
  const urls = new Map();
  for (let offset = 0; offset < paths.length; offset += 100) {
    const signed = await request('/storage/v1/object/sign/' + bucket, {method:'POST', body:{paths:paths.slice(offset, offset+100), expiresIn:3600}, token:authenticated ? await token() : undefined});
    for (const item of signed) {
      const url = item.signedURL || item.signedUrl;
      if (!item.error && url) urls.set(item.path, url.startsWith('https://') ? url : cloud.url + '/storage/v1' + url);
    }
  }
  for (const m of media) if (m.storage_path) m.url = urls.get(m.storage_path) || '';
}
function cleanWork(work) {
  const w = structuredClone(work);
  w.media = (w.media || []).map(m => {if (m.storage_path) delete m.url;return m;});
  return w;
}
export async function cloudApi(path, body) {
  if (path === '/api/public') {
    const data = await rpc('portfolio_public_content', {}, false);
    data.settings = {artist_name_zh:'郭展良', artist_name_en:'Kuo,Chan-Liang', ...data.settings};
    await hydrate(data.works, false);return data;
  }
  if (path === '/api/session') {
    if (!readSession()) return {authenticated:false, setup:false};
    try {return {authenticated:await rpc('portfolio_is_admin'), setup:false};}
    catch (e) {if (e.status === 400 || e.status === 401) return {authenticated:false, setup:false};throw e;}
  }
  if (path === '/api/login') {
    const session = await request('/auth/v1/token?grant_type=password', {method:'POST', body:{email:body.username.trim(), password:body.password}});
    storeSession(session);
    try {if (!await rpc('portfolio_is_admin')) throw Error('此帳號尚未取得管理權限。');}
    catch (e) {storeSession(null);throw e;}
    return {ok:true};
  }
  if (path === '/api/admin/logout') {
    try {await request('/auth/v1/logout', {method:'POST', token:await token()});}
    finally {storeSession(null);}
    return {ok:true};
  }
  if (path === '/api/admin') {
    const access = await token();
    const [records, settings] = await Promise.all([
      request('/rest/v1/portfolio_records?select=*&order=sort_order.asc,id.asc', {token:access}),
      request('/rest/v1/portfolio_settings?select=content&id=eq.1', {token:access})
    ]);
    await hydrate(records.flatMap(r => [r.draft,r.published]), true);
    return {records:records.map(r => ({...r, order:r.sort_order, previousStatus:r.previous_status, updated:r.updated_at})), settings:settings[0]?.content || {}};
  }
  if (path === '/api/admin/work') {
    const record = await rpc('portfolio_edit', {action:body.action, record_id:body.id || crypto.randomUUID(), work:body.work ? cleanWork(body.work) : null});
    return {record};
  }
  if (path === '/api/admin/reorder') return rpc('portfolio_reorder', {ids:body.ids});
  if (path === '/api/admin/feature') return rpc('portfolio_feature', {record_id:body.id, featured:body.featured});
  if (path === '/api/admin/settings') return rpc('portfolio_save_settings', {value:body});
  throw Error('不支援此操作。');
}
export async function importBundle(bundle, progress) {
  if (bundle.version !== 1 || !Array.isArray(bundle.records) || !Array.isArray(bundle.files) || !bundle.settings) throw Error('不是有效的作品備份檔。');
  if (!await rpc('portfolio_is_admin')) throw Error('請先登入管理員帳號。');
  if (!await rpc('portfolio_import_ready')) throw Error('雲端已有內容，已停止匯入以避免覆蓋。');
  const records = structuredClone(bundle.records), mapped = new Map();
  for (let i = 0; i < bundle.files.length; i++) {
    const f = bundle.files[i];
    progress(`正在上傳圖片 ${i+1} / ${bundle.files.length}`);
    const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
    const uploaded = await uploadFile(new Blob([bytes], {type:f.type}));
    mapped.set(f.url, uploaded.storage_path);
  }
  for (const r of records) for (const w of [r.draft, r.published].filter(Boolean)) {
    for (const m of w.media || []) {
      const storage_path = mapped.get(m.url);
      if (!storage_path) throw Error('備份缺少作品圖片，未匯入作品資料。');
      delete m.url;m.storage_path = storage_path;
    }
  }
  progress('正在保存作品、草稿與網站設定…');
  return rpc('portfolio_import', {records, settings:bundle.settings});
}
