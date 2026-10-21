'use strict';
/* Пульт контента. Данные — шапки md-файлов контент-системы, правки пишутся обратно в файл.
   Два режима: на маке (pult.py читает и пишет файлы) и GitHub (страница на Pages, файлы — в закрытом репо через API).
   Разбор шапок и правка — здесь, одинаково для обоих режимов. */

const GH_REPO = { owner: 'jetmetrics-io', repo: 'content-system', branch: 'main' };
const MAC_ROOT = '/Users/datmark/Documents/Claude Code/Content System';
const MODE = (location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('gh')) ? 'gh' : 'local';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<i data-lucide="${n}"></i>`;
const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); };
const pct = v => Math.round(v * 100) + ' %';
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const PILLARS = [
  { code: 'P1', name: 'Диагноз', target: 35, link: '[[P1 Диагноз]]' },
  { code: 'P2', name: 'Causal layer', target: 25, link: '[[P2 Causal layer]]' },
  { code: 'P3', name: 'Операционка', target: 20, link: '[[P3 Операционка]]' },
  { code: 'Personal', name: 'Личное', target: 15, link: '[[Personal]]' },
  { code: 'Promo', name: 'Промо', target: 5, link: '[[Promo]]' },
];
const PMAP = Object.fromEntries(PILLARS.map(p => [p.code, p]));
const pName = p => (p.code === 'Personal' || p.code === 'Promo' ? p.name : `${p.code} ${p.name}`);
const pShort = code => (code === 'Personal' || code === 'Promo' ? PMAP[code].name : code);
const IDEA_STATUSES = ['новая', 'в работе', 'отложена', 'отклонена', 'стала постом', 'архив'];
const POST_STATUSES = ['идея', 'в работе', 'черновик', 'готов', 'опубликован', 'парковка', 'архив'];
const STAT_KEYS = ['li_impressions', 'li_reach', 'li_reactions', 'li_comments', 'li_saves', 'li_reposts', 'li_sends',
  'li_profile_views', 'li_followers', 'tg_views', 'tg_reactions', 'tg_forwards', 'tg_comments', 'tg_clicks', 'tg_followers'];
const STAGES = [
  { key: 'идея', name: 'Идея', icon: 'lightbulb' },
  { key: 'в работе', name: 'В работе', icon: 'hammer' },
  { key: 'черновик', name: 'Черновик', icon: 'pen-line' },
  { key: 'готов', name: 'Готов', icon: 'circle-check' },
  { key: 'опубликован', name: 'Опубликован', icon: 'megaphone' },
  { key: 'парковка', name: 'Парковка', icon: 'circle-pause' },
];
const REJECTED = { key: 'отклонено', name: 'Отклонено', icon: 'trash-2' };
const IDEA_BY_STAGE = { 'идея': 'новая', 'в работе': 'в работе', 'парковка': 'отложена', 'отклонено': 'отклонена' };
const SRC = [['all', 'Все'], ['cards', 'Карточки сент.–окт.'], ['old', 'Старый банк'], ['b0610', 'Банк 06.10'], ['posts', 'Посты']];
const SORTS = [['rank', 'Твоя оценка и дуэли'], ['elo', 'Дуэли'], ['new', 'Сначала новые'], ['id', 'По номеру']];
const LIMIT = 60;
const PREF_KEY = 'pult:prefs:v2';
const TOKEN_KEY = 'pult:gh-token';

const S = {
  files: [], units: [], by: {}, theses: [], thesesBy: {}, became: {}, root: MAC_ROOT, today: null,
  view: 'ideas', f: { pillar: 'all', src: 'all', hidden: false, cmt: false, noPosted: true }, q: '', drafts: {},
  ideasKind: 'idea', sort: 'rank', planOffset: 0, rateMode: 'duel', rateKind: 'idea',
  tbl: { k: 'rank', dir: -1 }, expand: {}, drawer: null, dragKey: null, pair: null, lastPair: null,
  lastLoad: 0, loaded: false, loading: false,
};

/* ---------- настройки вида: только удобство, правда — в файлах ---------- */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    for (const k of ['view', 'ideasKind', 'sort', 'rateMode', 'rateKind']) if (p[k]) S[k] = p[k];
    if (p.f) Object.assign(S.f, p.f);
    if (!SORTS.some(s => s[0] === S.sort)) S.sort = 'rank';
  } catch (e) { /* хранилище недоступно */ }
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ view: S.view, ideasKind: S.ideasKind, sort: S.sort, rateMode: S.rateMode, rateKind: S.rateKind, f: S.f })); } catch (e) { /* нет хранилища */ }
}

/* ---------- шапка md: чтение и построчная правка (та же логика, что в _pult/fm.py) ---------- */
const FM = {
  KEY: /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/,
  NUM: /^-?\d+(\.\d+)?$/,
  PLAIN: /^[^\s\[\]{}"'*&!|>%@`#,?:\-][^#]*$/,
  split(text) {
    if (!text.startsWith('---')) return null;
    const lines = text.split('\n');
    if (lines[0].trim() !== '---') return null;
    for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return { lines, end: i };
    return null;
  },
  unquote(v) {
    if (v[0] === '"') {
      let i = 1;
      while (i < v.length) { if (v[i] === '\\') { i += 2; continue; } if (v[i] === '"') break; i++; }
      try { return JSON.parse(v.slice(0, Math.min(i, v.length - 1) + 1)); } catch (e) { return v.replace(/^"+|"+$/g, ''); }
    }
    const e = v.indexOf("'", 1);
    return e > 0 ? v.slice(1, e) : v.replace(/^'+|'+$/g, '');
  },
  value(raw) {
    let v = raw.trim();
    if (v === '') return null;
    if (v[0] === '"' || v[0] === "'") return FM.unquote(v);
    if (v.startsWith('#')) return null;
    if (v.includes(' #')) v = v.split(' #')[0].trimEnd();
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(x => x.trim()).map(x => (x && (x[0] === '"' || x[0] === "'") ? FM.unquote(x) : x)).filter(x => x !== '');
    }
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (FM.NUM.test(v)) return Number(v);
    return v;
  },
  read(text) {
    const sp = FM.split(text);
    if (!sp) return { fields: {}, body: text };
    const fields = {};
    for (const line of sp.lines.slice(1, sp.end)) {
      const m = line.match(FM.KEY);
      if (m && !(m[1] in fields)) fields[m[1]] = FM.value(m[2]);
    }
    return { fields, body: sp.lines.slice(sp.end + 1).join('\n') };
  },
  format(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    if (Array.isArray(v)) return '[' + v.map(FM.format).join(', ') + ']';
    const s = String(v);
    if (FM.PLAIN.test(s) && !s.includes(': ') && !s.endsWith(':') && !['true', 'false', 'null', '~'].includes(s) && !FM.NUM.test(s) && s === s.trim()) return s;
    return JSON.stringify(s);
  },
  /* новые поля встают после after (по умолчанию после status) и друг за другом */
  set(text, updates, after = 'status') {
    const sp = FM.split(text);
    if (!sp) throw new Error('у заметки нет шапки');
    const { lines } = sp;
    let { end } = sp;
    for (const [key, value] of Object.entries(updates)) {
      const line = value == null || value === '' ? `${key}: ` : `${key}: ${FM.format(value)}`;
      let idx = -1, anchor = -1;
      for (let i = 1; i < end; i++) {
        const m = lines[i].match(FM.KEY);
        if (!m) continue;
        if (m[1] === key) { idx = i; break; }
        if (after && m[1] === after) anchor = i;
      }
      if (idx >= 0) lines[idx] = line;
      else {
        lines.splice(anchor >= 0 ? anchor + 1 : end, 0, line);
        end++;
        if (anchor >= 0) after = key;
      }
    }
    return lines.join('\n');
  },
};

/* ---------- из файлов — карточки ---------- */
function normPillar(v) {
  if (!v) return null;
  const s = String(v);
  if (s.includes('P1')) return 'P1';
  if (s.includes('P2') || s.toLowerCase().includes('causal')) return 'P2';
  if (s.includes('P3')) return 'P3';
  if (s.includes('Personal')) return 'Personal';
  if (s.includes('Promo')) return 'Promo';
  return null;
}
const thesisId = v => (v ? (String(v).match(/T-\d{3}/) || [null])[0] : null);
const asDate = v => { if (v == null) return null; const s = String(v).trim().slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const asNum = v => { if (v == null || typeof v === 'boolean') return null; if (typeof v === 'number') return v; const s = String(v).replace(',', '.').replace(/\s/g, ''); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
function firstText(body, limit = 420) {
  const m = body.match(/\*\*Суть:\*\*\s*(.+)/); // старый банк: суть идеи, а не источник
  if (m) body = m[1];
  const out = [];
  for (const line of body.split('\n')) {
    const s = line.trim();
    if (!s || /^(#|>|\||```|<!--|!\[\[|---)/.test(s)) { if (out.length) break; continue; }
    out.push(s);
    if (out.join('').length > limit) break;
  }
  const t = out.join(' ').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\*\*|__|`/g, '');
  return t.length > limit ? t.slice(0, limit) + '…' : t;
}
const ideaStage = st => ({ 'новая': 'идея', 'в работе': 'в работе', 'отложена': 'парковка', 'отклонена': 'отклонено', 'стала постом': 'опубликован' })[st] || 'идея';

/* ---------- комментарии Дмитрия для Claude: раздел в конце заметки, галочка = Claude учёл ----------
   ## 💬 Комментарии Дмитрия
   - [ ] 💬 2026-10-19 18:40 — текст (продолжение — строки с отступом)
       - ↳ Claude 2026-10-20: что сделал                 ← ответ Claude, галочка становится [x]
   Открытые Claude собирает скриптом _pult/comments.py. */
const CMT_HEAD = '## 💬 Комментарии Дмитрия';
const CMT_RE = /^- \[( |x|X)\] 💬 (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))? — (.*)$/;
const isHeading = l => /^#{1,2} /.test(l);
function cmtSection(lines) {
  const start = lines.findIndex(l => l.trim() === CMT_HEAD);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (isHeading(lines[i])) { end = i; break; }
  return { start, end };
}
function parseComments(body) {
  const lines = body.split('\n');
  const sec = cmtSection(lines);
  if (!sec) return [];
  const out = [];
  for (const l of lines.slice(sec.start + 1, sec.end)) {
    const m = l.match(CMT_RE);
    if (m) { out.push({ done: m[1] !== ' ', date: m[2], time: m[3] || '', text: m[4], more: [], replies: [] }); continue; }
    const c = out[out.length - 1];
    if (!c || !/^\s+\S/.test(l)) continue;
    const s = l.trim();
    if (/^- ↳/.test(s)) c.replies.push(s.replace(/^- ↳\s*/, ''));
    else c.more.push(s);
  }
  return out;
}
function stripComments(body) {
  const lines = body.split('\n');
  const sec = cmtSection(lines);
  if (!sec) return body;
  lines.splice(sec.start, sec.end - sec.start);
  return lines.join('\n');
}
function addComment(text, comment, stamp) {
  const rows = comment.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const entry = [`- [ ] 💬 ${stamp} — ${rows[0]}`, ...rows.slice(1).map(s => '    ' + s)].join('\n');
  const lines = text.split('\n');
  const sec = cmtSection(lines);
  if (!sec) return { text: text.replace(/\s*$/, '') + `\n\n${CMT_HEAD}\n\n${entry}\n`, entry };
  let last = sec.end - 1;
  while (last > sec.start && lines[last].trim() === '') last--;
  const add = last === sec.start ? ['', entry] : [entry];
  if (sec.end < lines.length) add.push('');
  lines.splice(last + 1, 0, ...add);
  return { text: lines.join('\n'), entry };
}

function buildUnit(file) {
  const { fields, body } = FM.read(file.text);
  const kind = fields.type;
  if (kind !== 'idea' && kind !== 'post') return null;
  const stem = file.path.split('/').pop().replace(/\.md$/, '');
  let id = String(fields.id || '').trim();
  if (!id) id = (stem.match(/^([IP]-\d{3})/) || [null, stem])[1];
  const status = String(fields.status || (kind === 'idea' ? 'новая' : 'черновик')).trim();
  let title = fields.title ? String(fields.title) : stem;
  if (!fields.title && id && title.startsWith(id)) title = title.slice(id.length).replace(/^[\s—-]+|[\s—-]+$/g, '') || id;
  const u = {
    kind, id, path: file.path, ver: file.ver, text: file.text, body, title, status,
    stage: kind === 'idea' ? ideaStage(status) : (POST_STATUSES.includes(status) ? status : 'черновик'),
    pillar: normPillar(fields.pillar), pillar_inherited: false,
    thesis: thesisId(fields.thesis),
    format: fields.format || fields.format_used || null,
    source: fields.source || null,
    created: asDate(fields.created) || (kind === 'idea' ? asDate(fields.date) : null),
    date: asDate(fields.date),
    plan_date: asDate(fields.plan_date),
    my_score: asNum(fields.my_score),
    my_elo: asNum(fields.my_elo),
    my_duels: asNum(fields.my_duels) || 0,
    platforms: fields.platforms || fields.lang || null,
    rubric: fields.rubric || null,
    status_note: fields.status_note || null,
    // архив: папка _archive/ или status: архив (конвейер 2.0, 21.10.2026 — файлы остаются на месте)
    archived: ('/' + file.path).includes('/_archive/') || status === 'архив',
    preview: firstText(stripComments(body)),
    comments: parseComments(body),
  };
  u.cmtOpen = u.comments.filter(c => !c.done).length;
  if (kind === 'idea') u.post_ref = fields.post ? String(fields.post) : null;
  if (kind === 'post') {
    u.published = Object.fromEntries(['li', 'tg', 'fb', 'substack'].map(k => [k, fields['published_' + k] === true]));
    u.published_date = asDate(fields.published_date) || asDate(fields.published_en_date) || asDate(fields.published_ru_date) || (status === 'опубликован' ? u.date : null);
    u.stats = {};
    for (const k of STAT_KEYS) { const n = asNum(fields[k]); if (n != null) u.stats[k] = n; }
    u.idea_ref = (String(fields.idea || '').match(/I-\d{3}/) || [null])[0];
  }
  return u;
}
function buildThesis(file) {
  const { fields } = FM.read(file.text);
  if (fields.type !== 'thesis') return null;
  const stem = file.path.split('/').pop().replace(/\.md$/, '');
  const id = String(fields.id || '') || (stem.match(/^(T-\d{3})/) || [null, stem])[1];
  return { id, title: stem.startsWith(id) ? stem.slice(id.length).trim() : stem, pillar: normPillar(fields.pillar), path: file.path };
}
function derive(u) {
  const t = S.thesesBy[u.thesis];
  u.thesis_title = t ? t.title : null;
  if (!u.pillar && t && t.pillar) { u.pillar = t.pillar; u.pillar_inherited = true; }
  if (u.kind === 'idea') u.became_post = [...(S.became[u.id] || []), ...(u.post_ref ? [u.post_ref.split(' ')[0]] : [])];
  return u;
}
function ingest(files) {
  S.files = files;
  S.theses = files.filter(f => f.path.startsWith('theses/')).map(buildThesis).filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : 1));
  S.thesesBy = Object.fromEntries(S.theses.map(t => [t.id, t]));
  const units = files.filter(f => !f.path.startsWith('theses/')).map(buildUnit).filter(Boolean);
  S.became = {};
  units.forEach(u => { if (u.kind === 'post' && u.idea_ref) (S.became[u.idea_ref] = S.became[u.idea_ref] || []).push(u.id); });
  S.units = units.map(derive);
  S.by = Object.fromEntries(S.units.map(u => [u.path, u]));
}

/* ---------- хранилища: файлы на маке и репозиторий на GitHub ---------- */
const b64bytes = s => Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0));
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(b64bytes(s));
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
class Conflict extends Error { constructor(file) { super('conflict'); this.file = file; } }

const Local = {
  label: 'в файл',
  async list() {
    const r = await fetch('api/files', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    S.root = j.root;
    return j.files.map(f => ({ path: f.path, text: f.text, ver: f.mtime }));
  },
  async write(u, text) {
    const r = await fetch('api/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: u.path, text, mtime: u.ver }) });
    const j = await r.json();
    if (r.status === 409) throw new Conflict({ path: u.path, text: j.text, ver: j.mtime });
    if (!r.ok) throw new Error(j.error || r.status);
    return j.mtime;
  },
  imageSrc: name => Promise.resolve('api/file?name=' + encodeURIComponent(name)),
};

const GH = {
  label: 'на GitHub',
  token: null,
  tree: null,
  async api(path, opt = {}) {
    const r = await fetch('https://api.github.com' + path, { cache: 'no-store', ...opt, headers: { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) } });
    if (r.status === 401) { GH.logout(); throw new Error('Ключ доступа не подошёл или истёк — войди заново'); }
    return r;
  },
  async blobText(sha) {
    const b = await (await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/git/blobs/${sha}`)).json();
    return b64dec(b.content);
  },
  cache: {}, // текст по oid файла: при обновлении докачиваем только новые и изменённые
  async gql(query) {
    const r = await GH.api('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { o: GH_REPO.owner, r: GH_REPO.repo } }) });
    const j = r.ok ? await r.json() : null;
    if (!j || j.errors || !j.data || !j.data.repository) throw new Error('graphql');
    return j.data.repository;
  },
  /* список файлов с oid — один лёгкий запрос; тексты — только тех, что ещё не видели, частями параллельно */
  async list() {
    const dirs = ['ideas', 'posts', 'posts/_archive', 'theses'];
    let want = [];
    try {
      const repo = await GH.gql(`query($o:String!,$r:String!){repository(owner:$o,name:$r){${dirs.map((d, i) => `d${i}:object(expression:"${GH_REPO.branch}:${d}"){...on Tree{entries{name type oid}}}`).join(' ')}}}`);
      dirs.forEach((d, i) => ((repo['d' + i] && repo['d' + i].entries) || []).forEach(e => {
        if (e.type === 'blob' && e.name.endsWith('.md') && (d !== 'ideas' || /^I-/.test(e.name))) want.push({ path: `${d}/${e.name}`, oid: e.oid });
      }));
      const missing = [...new Set(want.map(e => e.oid).filter(o => GH.cache[o] == null))];
      const parts = [];
      for (let i = 0; i < missing.length; i += 40) parts.push(missing.slice(i, i + 40));
      await Promise.all(parts.map(async part => {
        const repo2 = await GH.gql(`query($o:String!,$r:String!){repository(owner:$o,name:$r){${part.map((o, i) => `b${i}:object(oid:"${o}"){...on Blob{text isTruncated}}`).join(' ')}}}`);
        await Promise.all(part.map(async (o, i) => {
          const b = repo2['b' + i];
          GH.cache[o] = b && !b.isTruncated && b.text != null ? b.text : await GH.blobText(o);
        }));
      }));
    } catch (e) {
      if (!GH.token) throw e;
      return GH.listRest();
    }
    return want.map(e => ({ path: e.path, text: GH.cache[e.oid], ver: e.oid }));
  },
  async listRest() {
    const r = await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/git/trees/${GH_REPO.branch}?recursive=1`);
    if (!r.ok) throw new Error(r.status === 404 ? 'репозиторий не найден или к нему нет доступа' : 'GitHub не отдал список файлов: ' + r.status);
    const tree = (await r.json()).tree;
    GH.tree = tree;
    const want = tree.filter(e => e.type === 'blob' && (/^ideas\/I-[^/]+\.md$/.test(e.path) || /^posts\/(_archive\/)?[^/]+\.md$/.test(e.path) || /^theses\/[^/]+\.md$/.test(e.path)));
    const out = [];
    for (let i = 0; i < want.length; i += 16) {
      out.push(...await Promise.all(want.slice(i, i + 16).map(async e => ({ path: e.path, text: GH.cache[e.sha] ?? (GH.cache[e.sha] = await GH.blobText(e.sha)), ver: e.sha }))));
    }
    return out;
  },
  async write(u, text, message) {
    const url = `/repos/${GH_REPO.owner}/${GH_REPO.repo}/contents/${encPath(u.path)}`;
    const r = await GH.api(url, { method: 'PUT', body: JSON.stringify({ message, content: b64enc(text), sha: u.ver, branch: GH_REPO.branch }) });
    if (r.status === 409 || r.status === 422) {
      const cur = await (await GH.api(`${url}?ref=${GH_REPO.branch}`)).json();
      if (cur && cur.sha && cur.sha !== u.ver) throw new Conflict({ path: u.path, text: b64dec(cur.content), ver: cur.sha });
    }
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || r.status);
    GH.cache[j.content.sha] = text;
    return j.content.sha;
  },
  async imageSrc(name) {
    if (!GH.tree) GH.tree = ((await (await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/git/trees/${GH_REPO.branch}?recursive=1`)).json()).tree) || [];
    const hit = GH.tree.find(e => e.type === 'blob' && e.path.split('/').pop() === name && !e.path.startsWith('_pult/'));
    if (!hit) return null;
    const r = await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/contents/${encPath(hit.path)}?ref=${GH_REPO.branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
    return r.ok ? URL.createObjectURL(await r.blob()) : null;
  },
  restore() {
    try { GH.token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch (e) { GH.token = null; }
    return !!GH.token;
  },
  remember(token, persist) {
    GH.token = token;
    try { sessionStorage.setItem(TOKEN_KEY, token); if (persist) localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* без хранилища — до закрытия вкладки */ }
  },
  logout() {
    GH.token = null;
    GH.tree = null;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) { /* нет хранилища */ }
  },
};
const Store = MODE === 'gh' ? GH : Local;

/* ключ доступа лежит в auth.json зашифрованным: PBKDF2-SHA256 → AES-GCM, расшифровка только в браузере */
async function decryptToken(password) {
  const r = await fetch('auth.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('На странице нет ключа доступа: его кладёт скрипт _pult/set_password.sh');
  const a = await r.json();
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64bytes(a.salt), iterations: a.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(a.iv) }, key, b64bytes(a.ct)));
  } catch (e) { throw new Error('Неверный пароль'); }
}

/* ---------- загрузка и запись ---------- */
const todayIso = () => isoOf(new Date());

async function load() {
  if (MODE === 'gh' && !GH.token) { renderLogin(); return false; }
  if (S.loading) return false;
  S.loading = true;
  if (!S.loaded) $('#view').innerHTML = `<div class="empty">Читаю ${MODE === 'gh' ? 'репозиторий на GitHub' : 'файлы'}…</div>`;
  try {
    const files = await Store.list();
    S.today = todayIso();
    ingest(files);
    S.loaded = true;
    S.lastLoad = Date.now();
    render();
    return true;
  } catch (e) {
    if (MODE === 'gh' && !GH.token) { S.loaded = false; renderLogin(e.message); return false; }
    if (S.loaded) toast('Не удалось обновить данные: ' + e.message, { kind: 'err' });
    else $('#view').innerHTML = `<div class="empty">Не удалось прочитать данные: ${esc(e.message)}.<br>${MODE === 'gh' ? 'Проверь связь и обнови страницу.' : 'Запусти ярлык «Пульт контента» на рабочем столе и обнови страницу.'}</div>`;
    return false;
  } finally { S.loading = false; }
}

function replaceFile(file) {
  const i = S.files.findIndex(f => f.path === file.path);
  if (i >= 0) S.files[i] = file; else S.files.push(file);
  const old = S.by[file.path];
  const nu = buildUnit(file);
  if (!nu) { ingest(S.files); return null; }
  if (old && old.kind === 'post' && old.idea_ref !== nu.idea_ref) { ingest(S.files); return S.by[file.path]; }
  derive(nu);
  const j = S.units.findIndex(x => x.path === file.path);
  if (j >= 0) S.units[j] = nu; else S.units.push(nu);
  S.by[file.path] = nu;
  return nu;
}

function rawOf(u, k) {
  if (k === 'pillar') return u.pillar_inherited ? null : u.pillar;
  if (k === 'my_duels') return u.my_duels || null;
  return u[k] ?? null;
}
function validate(u, fields) {
  const out = {};
  for (const [k, v0] of Object.entries(fields)) {
    let v = v0;
    if (v === '' || v == null) { out[k] = null; continue; }
    if (k === 'status' && !(u.kind === 'idea' ? IDEA_STATUSES : POST_STATUSES).includes(v)) throw new Error(`статус «${v}» не из списка`);
    if (k === 'plan_date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('дата должна быть ГГГГ-ММ-ДД');
    if (k === 'pillar') { if (!PMAP[v]) throw new Error('неизвестный пиллар'); v = PMAP[v].link; }
    if (k === 'my_score') { v = Number(v); if (!(v >= 1 && v <= 5)) throw new Error('оценка — от 1 до 5'); }
    if (k === 'my_elo' || k === 'my_duels') { v = Math.round(Number(v)); if (!(v >= 0)) throw new Error(`${k}: нужно число`); }
    out[k] = v;
  }
  return out;
}
function commitMessage(u, fields) {
  const parts = Object.entries(fields).map(([k, v]) => ({
    status: `статус → ${v}`, plan_date: v ? `в план на ${v}` : 'убран из плана', my_score: v ? `оценка ${v}` : 'оценка снята',
    pillar: `пиллар ${normPillar(v) || 'снят'}`, my_elo: 'дуэль',
  })[k]).filter(Boolean);
  return `пульт: ${u.id} ${parts.join(', ')}`;
}

/* правки одного файла идут строго по очереди: следующая ждёт новую версию предыдущей */
const queues = {};
function enqueue(path, fn) {
  const p = (queues[path] || Promise.resolve()).then(fn, fn);
  queues[path] = p.catch(() => {});
  return p;
}
function save(u0, fields, opt = {}) {
  return enqueue(u0.path, async () => {
    const u = S.by[u0.path];
    if (!u) return null;
    const prev = {};
    for (const k in fields) prev[k] = rawOf(u, k);
    let text;
    try { text = FM.set(u.text, validate(u, fields)); }
    catch (e) { toast(e.message, { kind: 'err' }); return null; }
    if (text === u.text) { if (!opt.quiet) render(); return u; }
    let ver;
    try { ver = await Store.write(u, text, commitMessage(u, validate(u, fields))); }
    catch (e) {
      if (e instanceof Conflict) {
        replaceFile(e.file);
        render();
        toast('Файл поменяли в другом месте. Показываю свежую версию — повтори действие.', { kind: 'warn' });
        return null;
      }
      if (MODE === 'gh' && !GH.token) { S.loaded = false; renderLogin(e.message); return null; }
      toast(MODE === 'gh' ? `GitHub не принял правку: ${e.message}` : 'Пульт не отвечает. Окно терминала с пультом открыто?', { kind: 'err' });
      return null;
    }
    const nu = replaceFile({ path: u.path, text, ver });
    if (!opt.quiet) render();
    if (opt.label) toast(opt.label, { undo: opt.undo === false ? null : () => save(S.by[u.path], prev, { label: 'Отменено', undo: false }) });
    return nu;
  });
}

/* ---------- отбор и порядок ---------- */
function srcGroup(u) {
  if (u.kind === 'post') return 'posts';
  const s = String(u.source || '');
  if (s.startsWith('старый банк')) return 'old';
  if (s.startsWith('банк 06.10')) return 'b0610';
  return 'cards';
}
const srcName = u => (SRC.find(x => x[0] === srcGroup(u)) || [])[1];
function pass(u) {
  if (!S.f.hidden && (u.stage === 'отклонено' || u.archived)) return false;
  if (S.f.pillar !== 'all' && (S.f.pillar === 'none' ? !!u.pillar : u.pillar !== S.f.pillar)) return false;
  if (S.f.src !== 'all' && srcGroup(u) !== S.f.src) return false;
  if (S.f.cmt && !u.cmtOpen) return false;
  if (S.f.noPosted && becamePost(u)) return false;
  if (S.q) {
    const hay = [u.id, u.title, u.thesis, u.thesis_title, u.source, u.format, u.preview, ...u.comments.map(c => c.text)].join(' ').toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
  }
  return true;
}
/* идея стала постом: на неё ссылается пост (idea: в шапке поста), у неё есть поле post: или статус «стала постом» */
const becamePost = u => u.kind === 'idea' && ((u.became_post && u.became_post.length > 0) || u.status === 'стала постом');
const cmpNum = (a, b) => (b ?? -1e9) - (a ?? -1e9);
const eloOf = u => (u.my_duels ? u.my_elo : null);
const newest = (a, b) => String(b.created || b.date || '').localeCompare(String(a.created || a.date || '')) || (a.id < b.id ? 1 : -1);
/* без оценок вперёд идёт живое: в работе, потом новые; отложенное и отклонённое — в конце */
const STAGE_RANK = { 'в работе': 0, 'готов': 0, 'черновик': 0, 'идея': 1, 'опубликован': 2, 'парковка': 3, 'отклонено': 4 };
const byStage = (a, b) => (STAGE_RANK[a.stage] ?? 2) - (STAGE_RANK[b.stage] ?? 2);
function sorter(key) {
  if (key === 'elo') return (a, b) => cmpNum(eloOf(a), eloOf(b)) || cmpNum(a.my_score, b.my_score) || byStage(a, b) || newest(a, b);
  if (key === 'new') return newest;
  if (key === 'id') return (a, b) => (a.id < b.id ? -1 : 1);
  return (a, b) => cmpNum(a.my_score, b.my_score) || cmpNum(eloOf(a), eloOf(b)) || byStage(a, b) || newest(a, b);
}

/* ---------- кусочки разметки ---------- */
function pillarHtml(u) {
  const p = PMAP[u.pillar];
  if (!p) return `<span class="pill"><span class="pdot"></span>без пиллара</span>`;
  return `<span class="pill ${u.pillar_inherited ? 'inh' : ''}" ${u.pillar_inherited ? 'title="Пиллар взят из тезиса"' : ''}><span class="pdot" style="background:var(--p-${p.code})"></span>${esc(pName(p))}</span>`;
}
function starsHtml(u, sm) {
  let h = `<span class="stars ${sm ? 'sm' : ''}" data-key="${esc(u.path)}" role="group" aria-label="Твоя оценка">`;
  for (let i = 1; i <= 5; i++) h += `<button type="button" data-star="${i}" class="${(u.my_score || 0) >= i ? 'on' : ''}" aria-label="${i} из 5">${icon('star')}</button>`;
  return h + '</span>';
}
const eloHtml = u => (u.my_duels ? `<span class="elo" title="Рейтинг по дуэлям, сравнений: ${u.my_duels}">${icon('swords')}${u.my_elo}</span>` : '');
function dShort(iso) { if (!iso) return ''; const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; }
function tagsHtml(u) {
  const t = [];
  if (becamePost(u)) t.push(`<span class="tag blue">${icon('megaphone')}стала постом${u.became_post.length ? ' ' + esc(u.became_post.join(', ')) : ''}</span>`);
  else if (u.kind === 'post' || u.status !== 'новая') t.push(`<span class="tag">${esc(u.status)}</span>`);
  if (u.thesis) t.push(`<span class="tag" title="${esc(u.thesis_title || '')}">${esc(u.thesis)}</span>`);
  if (u.kind === 'idea') t.push(`<span class="tag">${esc(srcName(u))}</span>`);
  if (u.plan_date) t.push(`<span class="tag green">${icon('calendar-days')}${dShort(u.plan_date)}</span>`);
  if (u.kind === 'post' && u.published_date && u.stage === 'опубликован') t.push(`<span class="tag">${icon('megaphone')}${dShort(u.published_date)}</span>`);
  if (u.cmtOpen) t.push(`<span class="tag cmt" title="Комментарии, которые Claude ещё не учёл">${icon('message-circle')}${u.cmtOpen}</span>`);
  return `<div class="tags">${t.join('')}</div>`;
}
function cardHtml(u) {
  return `<article class="card" data-open="${esc(u.path)}">
    <div class="row"><span class="uid">${esc(u.id)}</span>${pillarHtml(u)}</div>
    <h3>${esc(u.title)}</h3>
    ${u.preview ? `<p class="pv">${esc(u.preview)}</p>` : ''}
    ${tagsHtml(u)}
    <div class="foot">${eloHtml(u) || '<span></span>'}${starsHtml(u)}</div>
  </article>`;
}
function miniHtml(u) {
  return `<div class="mini" draggable="true" data-drag="${esc(u.path)}" data-open="${esc(u.path)}">
    <div class="row"><span class="uid">${esc(u.id)}</span><span class="pdot" style="background:var(--p-${u.pillar || 'none'})" title="${esc(PMAP[u.pillar] ? pName(PMAP[u.pillar]) : 'без пиллара')}"></span>
      <span class="r">${u.cmtOpen ? `<span class="tag cmt" title="Комментарии, которые Claude ещё не учёл">${icon('message-circle')}${u.cmtOpen}</span>` : ''}${u.plan_date ? `<span class="tag green">${icon('calendar-days')}${dShort(u.plan_date)}</span>` : ''}${u.my_score ? `<span title="Твоя оценка">★${u.my_score}</span>` : ''}</span></div>
    <div class="t">${esc(u.title)}</div>
  </div>`;
}

/* ---------- фильтры и шапка ---------- */
function renderWhere() {
  const where = $('#where');
  if (!where) return;
  where.innerHTML = MODE === 'gh'
    ? `<span class="where" title="Правки уходят коммитами в ${GH_REPO.owner}/${GH_REPO.repo}, оттуда — на мак">${icon('cloud')}GitHub</span>${GH.token ? `<button class="iconbtn" id="logout" title="Выйти" aria-label="Выйти">${icon('log-out')}</button>` : ''}`
    : `<span class="where" title="Правки пишутся в файлы на этом маке">${icon('hard-drive')}На маке</span>`;
}
function renderFilters() {
  const base = S.units.filter(u => S.f.hidden || !(u.stage === 'отклонено' || u.archived));
  const cnt = k => base.filter(u => (k === 'none' ? !u.pillar : u.pillar === k)).length;
  const pchips = [['all', 'Все', null, base.length], ...PILLARS.map(p => [p.code, pName(p), p.code, cnt(p.code)]), ['none', 'Без пиллара', 'none', cnt('none')]];
  const scnt = k => base.filter(u => k === 'all' || srcGroup(u) === k).length;
  $('#filters').innerHTML = `
    <div class="fgroup"><span class="flabel">Пиллар</span>${pchips.map(([k, n, c, x]) => `<button class="chip" data-f="pillar" data-v="${k}" aria-pressed="${S.f.pillar === k}">${c ? `<span class="pdot" style="background:var(--p-${c})"></span>` : ''}${esc(n)}<span class="c">${x}</span></button>`).join('')}</div>
    <div class="fgroup"><span class="flabel">Откуда</span>${SRC.map(([k, n]) => `<button class="chip" data-f="src" data-v="${k}" aria-pressed="${S.f.src === k}">${esc(n)}<span class="c">${scnt(k)}</span></button>`).join('')}</div>
    <label class="toggle"><input type="checkbox" id="noposted" ${S.f.noPosted ? 'checked' : ''}>Скрыть идеи, ставшие постами<span class="c">${S.units.filter(becamePost).length}</span></label>
    <label class="toggle"><input type="checkbox" id="hidden" ${S.f.hidden ? 'checked' : ''}>Показать отклонённые и архив</label>
    <label class="toggle"><input type="checkbox" id="cmtonly" ${S.f.cmt ? 'checked' : ''}>${icon('message-circle')}Только с комментариями, которые Claude ещё не учёл<span class="c">${S.units.filter(u => u.cmtOpen).length}</span></label>`;
  const ideas = S.units.filter(u => u.kind === 'idea' && ['идея', 'в работе'].includes(u.stage) && !becamePost(u)).length;
  const live = S.units.filter(u => u.kind === 'post' && !u.archived && ['идея', 'в работе', 'черновик', 'готов'].includes(u.stage)).length;
  $('#counts').textContent = `${ideas} идей в банке · ${live} постов в работе`;
  $$('#tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === S.view)));
  renderWhere();
}

/* ---------- экран «Идеи» ---------- */
function renderIdeas() {
  let list = S.units.filter(pass);
  if (S.ideasKind !== 'all') list = list.filter(u => u.kind === S.ideasKind);
  list.sort(sorter(S.sort));
  const lim = S.expand.ideas ? list.length : 120;
  return `<div class="viewhead"><h1>Идеи и посты</h1>
      <div class="seg">${[['idea', 'Идеи'], ['post', 'Посты'], ['all', 'Всё']].map(([k, n]) => `<button data-kind="${k}" aria-pressed="${S.ideasKind === k}">${n}</button>`).join('')}</div>
      <span class="hint">${list.length} шт.</span><div class="spacer"></div>
      <label class="hint">Порядок&nbsp;<select class="sel" id="sort">${SORTS.map(([k, n]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
    ${list.length ? `<div class="grid">${list.slice(0, lim).map(cardHtml).join('')}</div>` : `<div class="empty">Под фильтр ничего не попало.</div>`}
    ${list.length > lim ? `<p style="text-align:center"><button class="btn" data-expand="ideas">Показать ещё ${list.length - lim}</button></p>` : ''}`;
}

/* ---------- экран «Конвейер» ---------- */
function colSort(key) {
  if (key === 'опубликован') return (a, b) => String(b.published_date || '').localeCompare(String(a.published_date || '')) || (a.id < b.id ? 1 : -1);
  if (key === 'идея' || key === 'парковка') return sorter('rank');
  return (a, b) => String(a.plan_date || '9999').localeCompare(String(b.plan_date || '9999')) || (a.id < b.id ? 1 : -1);
}
function renderBoard() {
  const units = S.units.filter(u => pass(u) && !becamePost(u));
  const cols = S.f.hidden ? [...STAGES, REJECTED] : STAGES;
  return `<div class="viewhead"><h1>Конвейер</h1><span class="hint">Перетащи карточку в колонку — статус запишется в файл. Идею в черновик не перевести: черновик появляется, когда из идеи делают пост.</span></div>
    <div class="board" style="grid-template-columns:repeat(${cols.length}, minmax(220px, 1fr))">${cols.map(c => {
      const items = units.filter(u => u.stage === c.key).sort(colSort(c.key));
      const lim = S.expand['col:' + c.key] ? items.length : LIMIT;
      return `<section class="col" data-drop="${c.key}"><div class="colhead">${icon(c.icon)}${c.name}<span class="n">${items.length}</span></div>
        <div class="colbody" data-scroll="col:${c.key}">${items.slice(0, lim).map(miniHtml).join('')}
        ${items.length > lim ? `<button class="more" data-expand="col:${c.key}">ещё ${items.length - lim}</button>` : ''}</div></section>`;
    }).join('')}</div>
    <div class="trash" id="trash" data-drop="отклонено" hidden>${icon('trash-2')}Отклонить идею</div>`;
}
function moveTo(u, stage) {
  if (!u || u.stage === stage) return;
  const name = (STAGES.find(s => s.key === stage) || REJECTED).name.toLowerCase();
  const label = `${u.id}: ${u.stage} → ${name}. Записано ${Store.label}`;
  if (u.kind === 'idea') {
    const st = IDEA_BY_STAGE[stage];
    if (!st) { toast(`${u.id} — ещё идея, не пост. Черновик появится, когда из неё сделают пост: скажи Claude «делаем ${u.id}».`, { kind: 'warn', ms: 8000 }); return; }
    save(u, { status: st }, { label });
  } else {
    if (stage === 'отклонено') { toast('Пост не отклоняют — отправь его в парковку.', { kind: 'warn' }); return; }
    save(u, { status: stage }, { label });
  }
}

/* ---------- экран «План» ---------- */
function dateOf(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
function weekNo(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
function weekWarn(items) {
  const withP = items.filter(u => u.pillar);
  if (withP.length < 3) return '';
  const c = {};
  withP.forEach(u => { c[u.pillar] = (c[u.pillar] || 0) + 1; });
  for (const p of PILLARS) {
    if (((c[p.code] || 0) / withP.length) * 100 - p.target > 30) return `перекос в ${pShort(p.code)}: ${c[p.code]} из ${withP.length}`;
  }
  if (withP.length >= 4 && !c.P1) return 'нет ни одного P1 Диагноз';
  return '';
}
function renderPlan() {
  const today = dateOf(S.today);
  const start = addDays(mondayOf(today), 7 * S.planOffset);
  const weeks = 6;
  const end = addDays(start, 7 * weeks - 1);
  const inRange = iso => iso && iso >= isoOf(start) && iso <= isoOf(end);
  const planned = S.units.filter(u => pass(u) && inRange(u.plan_date) && u.stage !== 'опубликован');
  const published = S.units.filter(u => pass(u) && u.kind === 'post' && u.stage === 'опубликован' && inRange(u.published_date));
  const pool = S.units.filter(u => pass(u) && !u.plan_date && !becamePost(u) && !['опубликован', 'отклонено'].includes(u.stage)).sort(sorter('rank'));
  const lim = S.expand.pool ? pool.length : 80;
  const tIso = S.today;
  let rows = '';
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, 7 * w);
    const wItems = [];
    let cells = '';
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      const iso = isoOf(day);
      const pl = planned.filter(u => u.plan_date === iso);
      const pb = published.filter(u => u.published_date === iso);
      wItems.push(...pl, ...pb);
      const cls = ['day', d >= 5 ? 'weekend' : '', iso < tIso ? 'past' : '', iso === tIso ? 'today' : ''].join(' ');
      cells += `<div class="${cls}" data-drop-date="${iso}"><div class="dn"><span>${day.getDate()}${day.getDate() === 1 || (w === 0 && d === 0) ? ' ' + MON[day.getMonth()] : ''}</span>${iso === tIso ? '<span>сегодня</span>' : ''}</div>
        ${pb.map(u => `<div class="chipu pub" data-open="${esc(u.path)}" data-tip="${esc(`<b>${esc(u.id)}</b> вышел ${dShort(iso)}<br>${esc(u.title)}`)}">${icon('check')}<span class="uid">${esc(u.id)}</span><span class="tt">${esc(u.title)}</span></div>`).join('')}
        ${pl.map(u => `<div class="chipu ${iso < tIso ? 'late' : ''}" draggable="true" data-drag="${esc(u.path)}" data-open="${esc(u.path)}" data-tip="${esc(`<b>${esc(u.id)}</b> · ${esc(u.status)}${iso < tIso ? ' · <b>дата прошла</b>' : ''}<br>${esc(u.title)}`)}"><span class="pdot" style="background:var(--p-${u.pillar || 'none'})"></span><span class="uid">${esc(u.id)}</span><span class="tt">${esc(u.title)}</span></div>`).join('')}
      </div>`;
    }
    const byP = {};
    wItems.forEach(u => { const k = u.pillar || 'none'; byP[k] = (byP[k] || 0) + 1; });
    const order = [...PILLARS.map(p => p.code), 'none'].filter(k => byP[k]);
    const warn = weekWarn(wItems);
    rows += `<div class="week"><div class="wlabel"><b>нед ${weekNo(ws)}</b>${dShort(isoOf(ws))} — ${dShort(isoOf(addDays(ws, 6)))}</div>${cells}
      <div class="wsum">${wItems.length ? `<span>${wItems.length} в неделе</span><div class="bar">${order.map(k => `<i style="flex:${byP[k]};background:var(--p-${k})" data-tip="${esc(`${esc(PMAP[k] ? pName(PMAP[k]) : 'без пиллара')}: ${byP[k]}`)}"></i>`).join('')}</div>` : '<span class="faint">пусто</span>'}
      ${warn ? `<span class="warn">${icon('triangle-alert')}${esc(warn)}</span>` : ''}</div></div>`;
  }
  return `<div class="viewhead"><h1>Контент-план</h1>
      <button class="iconbtn" data-plan="-1" aria-label="Неделей раньше">${icon('chevron-left')}</button>
      <button class="btn" data-plan="0">Сегодня</button>
      <button class="iconbtn" data-plan="1" aria-label="Неделей позже">${icon('chevron-right')}</button>
      <span class="hint">${dShort(isoOf(start))} — ${dShort(isoOf(end))}. Перетащи идею на день — дата встанет в шапку файла. Назад в список — дата уберётся.</span></div>
    <div class="plan">
      <aside class="pool" data-drop-date=""><div class="colhead">${icon('list-ordered')}Не в плане<span class="n">${pool.length}</span></div>
        <div class="colbody" data-scroll="pool">${pool.slice(0, lim).map(miniHtml).join('')}
        ${pool.length > lim ? `<button class="more" data-expand="pool">ещё ${pool.length - lim}</button>` : ''}</div></aside>
      <div class="cal"><div class="calhead"><span></span>${WD.map(d => `<span>${d}</span>`).join('')}<span>Баланс пилларов</span></div>${rows}</div>
    </div>`;
}

/* ---------- экран «Оценка» ---------- */
function duelPool() { return S.units.filter(u => pass(u) && u.kind === 'idea' && ['идея', 'в работе', 'парковка'].includes(u.stage) && !becamePost(u)); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickPair() {
  const c = duelPool();
  if (c.length < 2) return null;
  const sorted = shuffle([...c]).sort((a, b) => (a.my_duels || 0) - (b.my_duels || 0));
  const minD = sorted[0].my_duels || 0;
  const head = sorted.filter(u => (u.my_duels || 0) <= minD + 1).slice(0, 12);
  const A = head[Math.floor(Math.random() * head.length)];
  const last = S.lastPair || [];
  const rest = sorted.filter(u => u !== A && !(last.includes(u.path) && last.includes(A.path))).slice(0, 16);
  const ea = A.my_elo || 1500;
  rest.sort((x, y) => Math.abs((x.my_elo || 1500) - ea) - Math.abs((y.my_elo || 1500) - ea));
  const B = rest[Math.floor(Math.random() * Math.min(3, rest.length))];
  return B ? [A.path, B.path] : null;
}
function duelCard(u, side) {
  return `<article class="dcard">
    <div class="row" style="display:flex;gap:10px;align-items:center"><span class="uid">${esc(u.id)}</span>${pillarHtml(u)}</div>
    <h2>${esc(u.title)}</h2>
    <p class="pv">${esc(u.preview || 'Описания нет — открой карточку.')}</p>
    ${tagsHtml(u)}
    <div class="row" style="display:flex;gap:12px;align-items:center">${starsHtml(u)}<button class="btn ghost" data-open="${esc(u.path)}">${icon('file-text')}Карточка</button></div>
    <div class="actions"><button class="btn primary" data-duel="${side === 'L' ? 1 : 0}">${side === 'L' ? icon('chevron-left') : ''}Эта сильнее${side === 'R' ? icon('chevron-right') : ''}</button>
      <span class="hint muted">${u.my_duels ? `дуэлей ${u.my_duels} · рейтинг ${u.my_elo}` : 'ещё не сравнивали'}</span></div>
  </article>`;
}
function renderRate() {
  const head = `<div class="viewhead"><h1>Оценка</h1>
    <div class="seg">${[['duel', 'Дуэль'], ['list', 'Список']].map(([k, n]) => `<button data-rate="${k}" aria-pressed="${S.rateMode === k}">${n}</button>`).join('')}</div>`;
  if (S.rateMode === 'list') return head + renderRateList();
  const pool = duelPool();
  if (!S.pair || !S.pair.every(p => pool.includes(S.by[p]))) S.pair = pickPair();
  if (!S.pair) return head + `</div><div class="empty">Для дуэли нужно хотя бы две идеи под текущий фильтр.</div>`;
  const [A, B] = S.pair.map(p => S.by[p]);
  const duelled = pool.filter(u => u.my_duels > 0).sort((a, b) => b.my_elo - a.my_elo);
  const total = Math.round(pool.reduce((s, u) => s + (u.my_duels || 0), 0) / 2);
  return head + `<span class="hint">Какая идея сильнее для ленты? <span class="kbd">←</span> <span class="kbd">→</span> выбрать, <span class="kbd">↓</span> равны, <span class="kbd">пробел</span> пропустить.</span></div>
    <div class="duel">${duelCard(A, 'L')}${duelCard(B, 'R')}
      <aside class="side"><h4>Рейтинг по дуэлям</h4>
        <span class="hint muted">Сравнений: ${total}. Без сравнений: ${pool.length - duelled.length} из ${pool.length}.</span>
        ${duelled.length ? `<ol>${duelled.slice(0, 12).map(u => `<li data-open="${esc(u.path)}"><span class="uid">${esc(u.id)}</span> ${esc(u.title.slice(0, 60))} <span class="faint mono">${u.my_elo}</span></li>`).join('')}</ol>` : '<span class="faint">Пока пусто: сравни пару идей.</span>'}
        <span class="hint faint">Рейтинг считается по Эло, как в шахматах: победа над сильной идеей даёт больше очков. Пишется в шапку: my_elo, my_duels.</span>
      </aside>
      <div class="duelbar"><button class="btn" data-duel="0.5">${icon('equal')}Равны</button><button class="btn ghost" data-duel="skip">${icon('skip-forward')}Пропустить</button></div>
    </div>`;
}
function eloPair(ra, rb, sa) {
  ra = ra || 1500; rb = rb || 1500;
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  return [Math.round(ra + 32 * (sa - ea)), Math.round(rb + 32 * ((1 - sa) - (1 - ea)))];
}
async function duel(result) {
  if (!S.pair) return;
  const [A, B] = S.pair.map(p => S.by[p]);
  S.lastPair = S.pair;
  S.pair = null;
  if (result === 'skip') { render(); return; }
  const sa = Number(result);
  const [na, nb] = eloPair(A.my_elo, B.my_elo, sa);
  const pa = { my_elo: A.my_elo ?? null, my_duels: A.my_duels || null };
  const pb = { my_elo: B.my_elo ?? null, my_duels: B.my_duels || null };
  render();
  const r1 = await save(A, { my_elo: na, my_duels: (A.my_duels || 0) + 1 }, { quiet: true });
  const r2 = r1 && await save(B, { my_elo: nb, my_duels: (B.my_duels || 0) + 1 }, { quiet: true });
  render();
  if (r1 && r2) {
    const word = sa === 1 ? `${A.id} сильнее ${B.id}` : sa === 0 ? `${B.id} сильнее ${A.id}` : `${A.id} и ${B.id} равны`;
    toast(`${word}. Записано`, { ms: 3500, undo: async () => { await save(S.by[A.path], pa, { quiet: true }); await save(S.by[B.path], pb, { quiet: true }); render(); toast('Дуэль отменена'); } });
  }
}
function renderRateList() {
  let list = S.units.filter(pass);
  if (S.rateKind !== 'all') list = list.filter(u => u.kind === S.rateKind);
  const cols = [
    { k: 'id', t: 'ID', v: u => u.id },
    { k: 'title', t: 'Название', v: u => u.title },
    { k: 'pillar', t: 'Пиллар', v: u => u.pillar || '' },
    { k: 'src', t: 'Откуда', v: u => srcName(u) },
    { k: 'elo', t: 'Дуэли', v: eloOf, num: true },
    { k: 'my', t: 'Твоя', v: u => u.my_score, num: true },
  ];
  const c = cols.find(x => x.k === S.tbl.k);
  if (!c) list.sort(sorter('rank'));
  else list.sort((a, b) => {
    const x = c.v(a), y = c.v(b);
    if (c.num) return S.tbl.dir * ((x ?? -1e9) - (y ?? -1e9)) || (a.id < b.id ? -1 : 1);
    return S.tbl.dir * String(x).localeCompare(String(y), 'ru');
  });
  const lim = S.expand.rate ? list.length : 200;
  return `<div class="seg">${[['idea', 'Идеи'], ['post', 'Посты'], ['all', 'Всё']].map(([k, n]) => `<button data-ratekind="${k}" aria-pressed="${S.rateKind === k}">${n}</button>`).join('')}</div>
    <span class="hint">${list.length} шт. Клик по заголовку — сортировка, по строке — карточка. Звёзды ставятся прямо в таблице.</span></div>
    <table class="tbl"><thead><tr>${cols.map(x => `<th class="${x.num ? 'num' : ''}" data-th="${x.k}" ${S.tbl.k === x.k ? `aria-sort="${S.tbl.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${x.t}${S.tbl.k === x.k ? (S.tbl.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
    <tbody>${list.slice(0, lim).map(u => `<tr data-open="${esc(u.path)}">
      <td class="mono">${esc(u.id)}</td><td class="title"><div>${esc(u.title)}</div></td><td>${pillarHtml(u)}</td><td class="muted">${esc(srcName(u))}</td>
      <td class="num mono">${u.my_duels ? u.my_elo : '<span class="faint">—</span>'}</td><td class="num">${starsHtml(u, true)}</td></tr>`).join('')}</tbody></table>
    ${list.length > lim ? `<p style="text-align:center"><button class="btn" data-expand="rate">Показать ещё ${list.length - lim}</button></p>` : ''}`;
}

/* ---------- экран «Обзор» ---------- */
function hbars(rows, opt = {}) {
  const max = opt.max || Math.max(1, ...rows.map(r => r.v));
  return `<div class="hbars">${rows.map(r => `<div class="hb" data-tip="${esc(r.tip || '')}">
      <span class="name">${r.color ? `<span class="pdot" style="background:${r.color}"></span>` : ''}${esc(r.name)}</span>
      <span class="track">${r.v > 0 ? `<span class="fill" style="width:max(3px, ${(r.v / max) * 100}%);background:${r.fill || 'var(--jm-green)'}"></span>` : ''}${r.target != null ? `<span class="tgt" style="left:calc(${(r.target / max) * 100}% - 1px)"></span>` : ''}</span>
      <span class="val">${r.label}</span></div>`).join('')}</div>`;
}
function tableHtml(head, rows) {
  return `<table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function pillarPanel(title, sub, items) {
  const n = items.length;
  const rows = PILLARS.map(p => {
    const c = items.filter(u => u.pillar === p.code).length;
    const share = n ? c / n : 0;
    return { name: pName(p), color: `var(--p-${p.code})`, fill: `var(--p-${p.code})`, v: share * 100, target: p.target, c,
      label: `<b>${n ? pct(share) : '—'}</b> · ${c} · цель ${p.target} %`, tip: `${esc(p.name)}: ${c} из ${n}, цель ${p.target} %` };
  });
  const none = items.filter(u => !u.pillar).length;
  if (none) rows.push({ name: 'Без пиллара', color: 'var(--p-none)', fill: 'var(--p-none)', v: none / n * 100, label: `<b>${pct(none / n)}</b> · ${none}`, tip: `Без пиллара: ${none}`, c: none });
  return `<div class="panel"><h3>${title}</h3><p class="sub">${sub}</p>
    ${n ? hbars(rows, { max: 100 }) : '<div class="empty">Пусто</div>'}
    <div class="legend"><span><i class="t"></i>цель по стратегии</span></div>
    <details><summary>Таблицей</summary>${tableHtml(['Пиллар', 'Штук', 'Доля', 'Цель'], rows.map(r => [r.name, r.c, n ? pct(r.v / 100) : '—', r.target != null ? r.target + ' %' : '—']))}</details></div>`;
}
function renderStats() {
  const today = dateOf(S.today);
  const tIso = S.today;
  const live = S.units.filter(u => pass(u) && !u.archived && u.stage !== 'отклонено' && !becamePost(u));
  const pub = S.units.filter(u => pass(u) && u.kind === 'post' && !u.archived && u.stage === 'опубликован');
  const since = d => isoOf(addDays(today, -d));
  const pub30 = pub.filter(u => u.published_date && u.published_date >= since(30));
  const pub90 = pub.filter(u => u.published_date && u.published_date >= since(90));
  const plan42 = live.filter(u => u.plan_date && u.plan_date >= tIso && u.plan_date <= isoOf(addDays(today, 42)) && u.stage !== 'опубликован');
  const plan14 = plan42.filter(u => u.plan_date <= isoOf(addDays(today, 14)));
  const st = k => live.filter(u => u.stage === k).length;
  const kpis = [
    ['Идей в банке', live.filter(u => u.kind === 'idea' && u.stage === 'идея').length, 'новые, без отложенных'], ['В работе', st('в работе'), 'идеи и посты'],
    ['Черновики', st('черновик'), 'постов'], ['Готово к выходу', st('готов'), 'постов'], ['Вышло за 30 дней', pub30.length, 'по дате публикации'], ['В плане на 2 недели', plan14.length, 'с датой в шапке'],
  ];
  const funnel = STAGES.map(s => ({ name: s.name, v: st(s.key), label: `<b>${st(s.key)}</b>`, fill: s.key === 'парковка' ? 'var(--jm-chart-compare)' : 'var(--jm-green)', tip: `${s.name}: ${st(s.key)}` }));
  const w0 = addDays(mondayOf(today), -7 * 25);
  const weeks = [];
  for (let i = 0; i < 26; i++) {
    const ws = addDays(w0, 7 * i), we = addDays(ws, 6);
    weeks.push({ ws, we, items: pub.filter(u => u.published_date && u.published_date >= isoOf(ws) && u.published_date <= isoOf(we)) });
  }
  const wmax = Math.max(2, ...weeks.map(w => w.items.length));
  const ticks = [];
  for (let t = 0; t <= wmax; t += wmax > 6 ? 2 : 1) ticks.push(t);
  const rhythm = `<div class="cols">${ticks.map(t => `<span class="grid-y" style="bottom:${t / wmax * 100}%"></span><span class="tick-y" style="bottom:${t / wmax * 100}%">${t}</span>`).join('')}
    ${weeks.map(w => `<div class="c ${w.items.length ? '' : 'zero'}" data-tip="${esc(`<b>${dShort(isoOf(w.ws))} — ${dShort(isoOf(w.we))}</b>: ${w.items.length}${w.items.length ? '<br>' + w.items.map(u => esc(u.id + ' ' + u.title.slice(0, 48))).join('<br>') : ''}`)}"><i style="height:${w.items.length / wmax * 100}%"></i></div>`).join('')}</div>
    <div class="xaxis">${weeks.map((w, i) => `<span>${i % 4 === 0 ? `${w.ws.getDate()}.${String(w.ws.getMonth() + 1).padStart(2, '0')}` : ''}</span>`).join('')}</div>`;
  const noDate = pub.filter(u => !u.published_date).length;
  const th = S.theses.map(t => {
    const posts = S.units.filter(u => u.kind === 'post' && !u.archived && u.thesis === t.id);
    return { t, ideas: live.filter(u => u.kind === 'idea' && u.thesis === t.id).length, posts: posts.length, pub: posts.filter(u => u.stage === 'опубликован').length };
  }).filter(r => S.f.pillar === 'all' || (S.f.pillar === 'none' ? !r.t.pillar : r.t.pillar === S.f.pillar))
    .sort((a, b) => a.pub - b.pub || a.posts - b.posts || (a.t.id < b.t.id ? -1 : 1));
  const zero = th.filter(r => r.pub === 0).length;
  const thLim = S.expand.theses ? th.length : 15;
  const perf = pub.filter(u => u.stats && Object.keys(u.stats).length).sort((a, b) => String(b.published_date).localeCompare(String(a.published_date)));
  const er = u => { const s = u.stats; if (!s.li_impressions) return null; return ((s.li_reactions || 0) + (s.li_comments || 0) + (s.li_reposts || 0)) / s.li_impressions; };
  return `<div class="viewhead"><h1>Обзор</h1><span class="hint">Считается по шапкам файлов и текущему фильтру сверху.</span></div>
    <div class="kpis">${kpis.map(([l, v, s]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('')}</div>
    <div class="panels">
      ${pillarPanel('Доли пилларов: вышло за 90 дней', `${pub90.length} постов с ${dShort(since(90))}. Черта — целевая доля из словаря пилларов.`, pub90)}
      ${pillarPanel('Доли пилларов: в плане на 6 недель', `${plan42.length} единиц с датой в плане до ${dShort(isoOf(addDays(today, 42)))}.`, plan42)}
      <div class="panel"><h3>Конвейер</h3><p class="sub">Сколько единиц на каждом шаге. Идеи, из которых уже сделан пост, не считаются дважды.</p>
        ${hbars(funnel)}
        <details><summary>Таблицей</summary>${tableHtml(['Шаг', 'Штук'], funnel.map(f => [f.name, f.v]))}</details></div>
      <div class="panel"><h3>Ритм публикаций</h3><p class="sub">Постов в неделю за полгода, по дате публикации.${noDate ? ` У ${noDate} опубликованных даты нет — они не попали в график.` : ''}</p>
        ${rhythm}
        <details><summary>Таблицей</summary>${tableHtml(['Неделя', 'Постов', 'Какие'], weeks.filter(w => w.items.length).map(w => [`${dShort(isoOf(w.ws))} — ${dShort(isoOf(w.we))}`, w.items.length, w.items.map(u => u.id).join(', ')]))}</details></div>
      <div class="panel wide"><h3>Тезисы и покрытие</h3><p class="sub">${zero} из ${th.length} тезисов без опубликованного поста. Сверху — самые недокрытые.</p>
        <table class="tbl"><thead><tr><th>Тезис</th><th>Пиллар</th><th class="num">Идей</th><th class="num">Постов</th><th class="num">Вышло</th></tr></thead>
        <tbody>${th.slice(0, thLim).map(r => `<tr data-q="${esc(r.t.id)}"><td class="title"><div><span class="uid">${esc(r.t.id)}</span> ${esc(r.t.title)}</div></td><td>${pillarHtml({ pillar: r.t.pillar })}</td><td class="num mono">${r.ideas}</td><td class="num mono">${r.posts}</td><td class="num mono">${r.pub || '<span class="faint">0</span>'}</td></tr>`).join('')}</tbody></table>
        ${th.length > thLim ? `<p style="text-align:center"><button class="btn" data-expand="theses">Все ${th.length}</button></p>` : ''}
        <p class="sub" style="margin-top:8px">Клик по тезису — поиск его идей и постов на экране «Идеи».</p></div>
      <div class="panel wide"><h3>Результативность</h3>
        <div class="note">${icon('info')}<span>Цифры охвата внесены у ${perf.length} из ${pub.length} опубликованных постов. График появится, когда цифр станет больше — сейчас по ним нельзя сравнивать пиллары или форматы.</span></div>
        ${perf.length ? `<table class="tbl"><thead><tr><th>Пост</th><th>Вышел</th><th class="num">Показы LI</th><th class="num">Реакции</th><th class="num">Комм.</th><th class="num">Сохр.</th><th class="num">Вовлечённость</th><th class="num">Просм. TG</th></tr></thead>
        <tbody>${perf.map(u => `<tr data-open="${esc(u.path)}"><td class="title"><div><span class="uid">${esc(u.id)}</span> ${esc(u.title)}</div></td><td class="mono">${dShort(u.published_date)}</td>
          ${['li_impressions', 'li_reactions', 'li_comments', 'li_saves'].map(k => `<td class="num mono">${u.stats[k] ?? '—'}</td>`).join('')}<td class="num mono">${er(u) != null ? (er(u) * 100).toFixed(1).replace('.', ',') + ' %' : '—'}</td><td class="num mono">${u.stats.tg_views ?? '—'}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>
    </div>`;
}

/* ---------- боковая панель карточки ---------- */
function mdToHtml(md) {
  let s = md.replace(/```dataview(js)?[\s\S]*?```/g, '\n<div class="dv">Блок Dataview — виден в Обсидиане</div>\n');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (m, name) => (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)
    ? `<img data-img="${esc(name.split('/').pop())}" alt="${esc(name)}">` : `<span class="wl">${esc(name)}</span>`));
  s = s.replace(/\[\[([^\]|\\]+)\\?\|([^\]]+)\]\]/g, (m, a, b) => `<span class="wl">${esc(b)}</span>`);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (m, a) => `<span class="wl">${esc(a.split('/').pop())}</span>`);
  const html = window.marked ? marked.parse(s, { gfm: true }) : `<pre>${esc(s)}</pre>`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}
const imgCache = {};
function fillImages(root) {
  $$('img[data-img]', root).forEach(async img => {
    const name = img.dataset.img;
    try {
      imgCache[name] = imgCache[name] || Store.imageSrc(name);
      const src = await imgCache[name];
      if (src) img.src = src;
      else img.replaceWith(Object.assign(document.createElement('span'), { className: 'wl', textContent: name }));
    } catch (e) { /* картинка не загрузилась — остаётся подпись */ }
  });
}
function commentsHtml(u) {
  const list = u.comments.map(c => `<div class="cmt ${c.done ? 'done' : ''}">
      <div class="cmeta">${c.done ? `${icon('check-check')}учтено` : `${icon('clock')}ждёт Claude`}<span>${dShort(c.date)}${c.time ? ' ' + c.time : ''}</span></div>
      <div class="ctext">${esc([c.text, ...c.more].join('\n'))}</div>
      ${c.replies.map(r => `<div class="creply">${icon('corner-down-right')}${esc(r)}</div>`).join('')}
    </div>`).join('');
  return `<div class="cmts"><p class="section-l">Комментарии для Claude</p>
    ${list}
    <textarea id="d-cmt" rows="3" placeholder="Что Claude учесть по этой ${u.kind === 'idea' ? 'идее' : 'заметке'}: поправить угол, связать с другой идеей, не брать…"></textarea>
    <div class="inline"><button class="btn primary" id="d-cmt-send">${icon('send')}Отправить</button>
      <span class="hint faint">Cmd+Enter. Запишется в файл, Claude заберёт при следующей работе с контентом.</span></div>
  </div>`;
}
function stampNow() { const d = new Date(); return `${isoOf(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function sendComment(u0) {
  const val = ($('#d-cmt')?.value || '').trim();
  if (!val) return;
  const path = u0.path;
  enqueue(path, async () => {
    const u = S.by[path];
    const prev = u.text;
    const { text, entry } = addComment(u.text, val, stampNow());
    let ver;
    try { ver = await Store.write(u, text, `пульт: ${u.id} комментарий для Claude`); }
    catch (e) {
      if (e instanceof Conflict) { replaceFile(e.file); render(); toast('Файл поменяли в другом месте. Показываю свежую версию — отправь ещё раз, текст сохранён.', { kind: 'warn' }); return; }
      toast(MODE === 'gh' ? `GitHub не принял комментарий: ${e.message}` : 'Пульт не отвечает. Окно терминала с пультом открыто?', { kind: 'err' });
      return;
    }
    delete S.drafts[path];
    replaceFile({ path, text, ver });
    render();
    toast(`${u.id}: комментарий записан ${Store.label}`, { undo: () => enqueue(path, async () => {
      const cur = S.by[path];
      // файл с тех пор не меняли — вернуть как было; меняли — убрать только эту запись
      const back = cur.text === text ? prev : cur.text.replace('\n' + entry, '');
      try { const v = await Store.write(cur, back, `пульт: ${cur.id} комментарий отменён`); replaceFile({ path, text: back, ver: v }); S.drafts[path] = val; render(); toast('Комментарий отменён'); }
      catch (e) { toast('Не вышло отменить — удали комментарий в Обсидиане', { kind: 'err' }); }
    }) });
  });
}
function closeDrawer() { S.drawer = null; $('#drawer-root').innerHTML = ''; }
function openDrawer(key) { S.drawer = key; renderDrawer(); }
function renderDrawer() {
  const u = S.by[S.drawer];
  if (!u) { closeDrawer(); return; }
  const prevScroll = $('.dbody')?.scrollTop || 0;
  const statuses = u.kind === 'idea' ? IDEA_STATUSES : POST_STATUSES;
  const meta = [];
  if (u.thesis) meta.push(['Тезис', `${u.thesis} ${u.thesis_title || ''}`]);
  if (u.format) meta.push(['Формат', u.format]);
  if (u.source) meta.push(['Откуда', u.source]);
  if (u.rubric) meta.push(['Группа', u.rubric]);
  if (u.platforms) meta.push(['Площадки', u.platforms]);
  if (u.created) meta.push(['Заведена', dShort(u.created) + ' ' + u.created.slice(0, 4)]);
  if (u.status_note) meta.push(['Пометка к статусу', u.status_note]);
  if (becamePost(u)) meta.push(['Стала постом', u.post_ref || u.became_post.join(', ') || 'да (статус в файле)']);
  if (u.kind === 'post') {
    const where = Object.entries(u.published || {}).filter(([, v]) => v).map(([k]) => ({ li: 'LinkedIn', tg: 'Telegram', fb: 'Facebook', substack: 'Substack' }[k]));
    if (where.length) meta.push(['Вышел', `${where.join(', ')}${u.published_date ? ' · ' + dShort(u.published_date) : ''}`]);
    if (u.idea_ref) meta.push(['Из идеи', u.idea_ref]);
  }
  meta.push(['Файл', u.path]);
  const ghUrl = `https://github.com/${GH_REPO.owner}/${GH_REPO.repo}/blob/${GH_REPO.branch}/${encPath(u.path)}`;
  $('#drawer-root').innerHTML = `<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-label="${esc(u.id)}">
    <div class="dhead"><div class="row"><span class="uid">${esc(u.id)}</span><span class="kind">${u.kind === 'idea' ? 'идея' : 'пост'}</span>${pillarHtml(u)}<span class="spacer"></span>
      <a class="linkbtn" href="obsidian://open?path=${encodeURIComponent(S.root + '/' + u.path)}" title="Откроется на маке, где стоит Обсидиан">${icon('external-link')}Обсидиан</a>
      ${MODE === 'gh' ? `<a class="linkbtn" href="${ghUrl}" target="_blank" rel="noopener" title="Файл в репозитории — там же правка текста">${icon('file-code')}GitHub</a>` : ''}
      <button class="iconbtn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <h2>${esc(u.title)}</h2></div>
    <div class="dbody">
      <div class="fields">
        <span class="k">Статус</span><select class="sel" id="d-status">${statuses.map(s => `<option ${s === u.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}${statuses.includes(u.status) ? '' : `<option selected disabled>${esc(u.status)}</option>`}</select>
        <span class="k">Пиллар</span><div class="inline"><select class="sel" id="d-pillar"><option value="">— не задан</option>${PILLARS.map(p => `<option value="${p.code}" ${u.pillar === p.code ? 'selected' : ''}>${esc(pName(p))}</option>`).join('')}</select>${u.pillar_inherited ? '<span class="faint">взят из тезиса, в файле пусто</span>' : ''}</div>
        <span class="k">Дата в плане</span><div class="inline"><input type="date" id="d-plan" value="${u.plan_date || ''}">${u.plan_date ? `<button class="btn ghost" id="d-plan-clear">${icon('x')}Убрать</button>` : ''}</div>
        <span class="k">Твоя оценка</span><div class="inline">${starsHtml(u)}${u.my_score ? '<span class="faint">клик по той же звезде — снять</span>' : ''}</div>
        ${u.my_duels ? `<span class="k">Дуэли</span><span>${u.my_duels} сравн. · рейтинг ${u.my_elo}</span>` : ''}
      </div>
      <div class="fields">${meta.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
      ${commentsHtml(u)}
      <div><p class="section-l">Текст файла</p><div class="md">${mdToHtml(stripComments(u.body))}</div></div>
    </div>
  </aside>`;
  icons();
  fillImages($('#drawer-root'));
  const db = $('.dbody');
  if (db) db.scrollTop = prevScroll;
  $('#d-status').onchange = e => save(u, { status: e.target.value }, { label: `${u.id}: статус «${e.target.value}». Записано ${Store.label}` });
  $('#d-pillar').onchange = e => save(u, { pillar: e.target.value || null }, { label: `${u.id}: пиллар ${e.target.value ? pShort(e.target.value) : 'снят'}. Записано ${Store.label}` });
  $('#d-plan').onchange = e => save(u, { plan_date: e.target.value || null }, { label: e.target.value ? `${u.id} в плане на ${dShort(e.target.value)}` : `${u.id} убран из плана` });
  const clr = $('#d-plan-clear');
  if (clr) clr.onclick = () => save(u, { plan_date: null }, { label: `${u.id} убран из плана` });
  const ta = $('#d-cmt');
  if (ta) {
    ta.value = S.drafts[u.path] || '';
    ta.oninput = () => { S.drafts[u.path] = ta.value; };
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(u); } };
    $('#d-cmt-send').onclick = () => sendComment(u);
  }
}

/* ---------- вход по паролю (режим GitHub) ---------- */
function renderLogin(msg) {
  closeDrawer();
  $('#filters').innerHTML = '';
  $('#counts').textContent = '';
  renderWhere();
  $('#view').innerHTML = `<form class="login" id="login">
    <h1>Вход в пульт</h1>
    <p class="muted">Идеи и посты лежат в закрытом репозитории ${GH_REPO.owner}/${GH_REPO.repo}. Пароль открывает к нему доступ с этого устройства.</p>
    <input class="field" type="password" id="pw" placeholder="Пароль" autocomplete="current-password" required>
    <label class="toggle"><input type="checkbox" id="remember" checked>Запомнить на этом устройстве</label>
    <button class="btn primary" type="submit">${icon('log-in')}Войти</button>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
  </form>`;
  icons();
  $('#pw').focus();
  $('#login').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#login button[type=submit]');
    btn.disabled = true; btn.textContent = 'Проверяю…';
    try {
      GH.remember(await decryptToken($('#pw').value), $('#remember').checked);
      await load();
    } catch (err) { renderLogin(err.message); }
  };
}

/* ---------- тосты и подсказки ---------- */
function toast(msg, { kind = '', undo = null, ms = 6000 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (undo) {
    const b = document.createElement('button');
    b.innerHTML = icon('undo-2') + 'Отменить';
    b.onclick = () => { el.remove(); undo(); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  icons();
  setTimeout(() => el.remove(), ms);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
const tip = $('#tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t || !t.dataset.tip || S.dragKey) { tip.hidden = true; return; }
  tip.innerHTML = t.dataset.tip;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});

/* ---------- отрисовка ---------- */
function render() {
  if (!S.loaded) return;
  const keep = {};
  $$('[data-scroll]').forEach(el => { keep[el.dataset.scroll] = el.scrollTop; });
  renderFilters();
  const v = { ideas: renderIdeas, board: renderBoard, plan: renderPlan, rate: renderRate, stats: renderStats }[S.view] || renderIdeas;
  $('#view').innerHTML = v();
  $$('[data-scroll]').forEach(el => { if (keep[el.dataset.scroll]) el.scrollTop = keep[el.dataset.scroll]; });
  icons();
  if (S.drawer) renderDrawer();
}

/* ---------- события ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#logout')) { GH.logout(); S.loaded = false; renderLogin(); return; }
  if (!S.loaded) return;
  const star = t.closest('[data-star]');
  if (star) {
    e.stopPropagation();
    const u = S.by[star.closest('[data-key]').dataset.key];
    const v = Number(star.dataset.star);
    const nv = u.my_score === v ? null : v;
    save(u, { my_score: nv }, { label: nv ? `${u.id}: твоя оценка ${nv} из 5` : `${u.id}: твоя оценка снята` });
    return;
  }
  if (t.closest('[data-close]')) { closeDrawer(); return; }
  const tab = t.closest('#tabs .tab');
  if (tab) { S.view = tab.dataset.view; savePrefs(); render(); window.scrollTo(0, 0); return; }
  const f = t.closest('[data-f]');
  if (f) { S.f[f.dataset.f] = f.dataset.v; savePrefs(); render(); return; }
  const kind = t.closest('[data-kind]');
  if (kind) { S.ideasKind = kind.dataset.kind; savePrefs(); render(); return; }
  const rk = t.closest('[data-ratekind]');
  if (rk) { S.rateKind = rk.dataset.ratekind; savePrefs(); render(); return; }
  const rate = t.closest('[data-rate]');
  if (rate) { S.rateMode = rate.dataset.rate; savePrefs(); render(); return; }
  const ex = t.closest('[data-expand]');
  if (ex) { S.expand[ex.dataset.expand] = true; render(); return; }
  const pl = t.closest('[data-plan]');
  if (pl) { const d = Number(pl.dataset.plan); S.planOffset = d === 0 ? 0 : S.planOffset + d; render(); return; }
  const du = t.closest('[data-duel]');
  if (du) { duel(du.dataset.duel); return; }
  const th = t.closest('[data-th]');
  if (th) { const k = th.dataset.th; S.tbl = { k, dir: S.tbl.k === k ? -S.tbl.dir : (['id', 'title', 'pillar', 'src'].includes(k) ? 1 : -1) }; render(); return; }
  const q = t.closest('[data-q]');
  if (q) { S.q = q.dataset.q; $('#q').value = S.q; S.view = 'ideas'; S.ideasKind = 'all'; savePrefs(); render(); window.scrollTo(0, 0); return; }
  const op = t.closest('[data-open]');
  if (op && !t.closest('select, input, a')) openDrawer(op.dataset.open);
});
document.addEventListener('change', e => {
  if (e.target.id === 'hidden') { S.f.hidden = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'cmtonly') { S.f.cmt = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'noposted') { S.f.noPosted = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'sort') { S.sort = e.target.value; savePrefs(); render(); }
});
let qTimer;
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 150); });
$('#reload').addEventListener('click', async () => { if (await load()) toast(MODE === 'gh' ? 'Данные с GitHub обновлены' : 'Файлы перечитаны', { ms: 2000 }); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.drawer) { closeDrawer(); return; }
  const typing = e.target.closest && e.target.closest('input, select, textarea');
  if (S.view !== 'rate' || S.rateMode !== 'duel' || S.drawer || typing || !S.loaded) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); duel('1'); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); duel('0'); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); duel('0.5'); }
  else if (e.key === ' ') { e.preventDefault(); duel('skip'); }
});

/* перетаскивание: конвейер (data-drop = этап) и план (data-drop-date = дата, пусто = убрать) */
document.addEventListener('dragstart', e => {
  const d = e.target.closest && e.target.closest('[data-drag]');
  if (!d) return;
  S.dragKey = d.dataset.drag;
  e.dataTransfer.setData('text/plain', S.dragKey);
  e.dataTransfer.effectAllowed = 'move';
  d.classList.add('dragging');
  tip.hidden = true;
  const u = S.by[S.dragKey];
  const tr = $('#trash');
  if (tr && u && u.kind === 'idea') tr.hidden = false;
});
document.addEventListener('dragend', () => {
  S.dragKey = null;
  $$('.dragging').forEach(x => x.classList.remove('dragging'));
  $$('.over').forEach(x => x.classList.remove('over'));
  const tr = $('#trash'); if (tr) tr.hidden = true;
});
const dropTarget = e => e.target.closest && (e.target.closest('[data-drop]') || e.target.closest('[data-drop-date]'));
document.addEventListener('dragover', e => {
  const z = dropTarget(e);
  if (!z || !S.dragKey) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  $$('.over').forEach(x => { if (x !== z) x.classList.remove('over'); });
  z.classList.add('over');
});
document.addEventListener('dragleave', e => {
  const z = dropTarget(e);
  if (z && !z.contains(e.relatedTarget)) z.classList.remove('over');
});
document.addEventListener('drop', e => {
  const z = dropTarget(e);
  if (!z) return;
  e.preventDefault();
  const u = S.by[e.dataTransfer.getData('text/plain') || S.dragKey];
  z.classList.remove('over');
  if (!u) return;
  if (z.dataset.drop !== undefined) { moveTo(u, z.dataset.drop); return; }
  const iso = z.dataset.dropDate || null;
  if ((u.plan_date || null) === iso) return;
  save(u, { plan_date: iso }, { label: iso ? `${u.id} в плане на ${dShort(iso)}. Записано ${Store.label}` : `${u.id} убран из плана` });
});

/* свежие данные при возврате в окно: правки из Обсидиана и с других устройств */
window.addEventListener('focus', () => { if (S.loaded && !S.dragKey && Date.now() - S.lastLoad > (MODE === 'gh' ? 30000 : 4000)) load(); });

loadPrefs();
if (MODE === 'gh') GH.restore();
load();
