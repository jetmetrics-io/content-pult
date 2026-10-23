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
  'li_profile_views', 'li_followers', 'tg_views', 'tg_reactions', 'tg_forwards', 'tg_comments', 'tg_clicks', 'tg_followers',
  'fb_views', 'fb_reactions', 'fb_comments', 'fb_shares', 'ss_views'];
/* площадки (23.10.2026): в шапке published_<k>: true, своя дата — published_<k>_date, если площадка вышла не в день published_date.
   short — как в reference/вышедшее.md; reach — поле охвата: у LinkedIn показы, у остальных просмотры, поэтому площадки по нему не сравнивают */
const CH = [
  { k: 'li', name: 'LinkedIn', short: 'LI', reach: 'li_impressions', stats: [['li_impressions', 'показы'], ['li_reactions', 'реакции'], ['li_comments', 'комм.'], ['li_reposts', 'репосты'], ['li_saves', 'сохр.']] },
  { k: 'tg', name: 'Telegram', short: 'TG', reach: 'tg_views', stats: [['tg_views', 'просмотры'], ['tg_reactions', 'реакции'], ['tg_forwards', 'пересылки'], ['tg_comments', 'комм.']] },
  { k: 'fb', name: 'Facebook', short: 'FB', reach: 'fb_views', stats: [['fb_views', 'просмотры'], ['fb_reactions', 'реакции'], ['fb_comments', 'комм.'], ['fb_shares', 'репосты']] },
  { k: 'substack', name: 'Substack', short: 'SB', reach: 'ss_views', stats: [['ss_views', 'просмотры']] },
];
const chShort = u => CH.filter(c => u.published && u.published[c.k]).map(c => c.short).join(' ');
const SRC = [['all', 'Все'], ['batch', 'Партии с 21.10'], ['cards', 'Карточки сент.–окт.'], ['old', 'Старый банк'], ['b0610', 'Банк 06.10'], ['posts', 'Посты']];
// звёзды и дуэли сняты 21.10.2026 (конвейер 2.0): порядок только по номеру или свежести
const SORTS = [['id', 'По номеру'], ['new', 'Сначала новые']];
const LIMIT = 60;
/* библиотека форм для картинок (этап 3 «Формат»): visuals/forms/library.json, собирает visuals/forms/build.py */
const FORMS_PATH = 'visuals/forms/library.json';
const formId = v => (String(v || '').match(/V-\d{2,3}/) || [null])[0];
const TIER_TAG = { win: 'green', cond: 'yellow', weak: 'coral', none: '' };
/* конвейер 2.0: этап поста (поле stage, «2 детали») и чей ход (поле turn: claude · дмитрий).
   С 22.10.2026 детали и форма — один этап (решение Дмитрия): было 2 детали · 3 формат · 4 прототип · 5 медиа · 6 фактура · 7 текст */
const STEPS = { 2: 'Детали и форма', 3: 'Прототип', 4: 'Медиа', 5: 'Фактура', 6: 'Текст' };
const FORM_STEP = 2, TEXT_STEP = 6, OUT_LANE = 7; // где выбирают форму · текст пишет Дмитрий · «Вышло» на доске
const stepVal = n => `${n} ${STEPS[n].toLowerCase()}`;
/* экран «Конвейер» и воронка в «Обзоре» — по этапам (22.10.2026): идея → детали → … → вышло */
const LANES = [
  { n: 1, name: 'Идея', icon: 'lightbulb' },
  { n: 2, name: 'Детали и форма', icon: 'search' },
  { n: 3, name: 'Прототип', icon: 'drafting-compass' },
  { n: 4, name: 'Медиа', icon: 'image' },
  { n: 5, name: 'Фактура', icon: 'clipboard-list' },
  { n: 6, name: 'Текст', icon: 'pen-line' },
  { n: 7, name: 'Вышло', icon: 'megaphone' },
];
const NO_LANE = { n: 0, name: 'Без этапа', icon: 'circle-help' };
const WHO = { me: 'Ждут тебя', claude: 'У Claude', park: 'Отложены' };
const whoName = l => (l.who === 'me' ? (l.n === TEXT_STEP ? 'пишешь ты' : 'ждёт тебя') : l.who === 'claude' ? 'у Claude' : l.who === 'park' ? 'отложена' : '');
/* что делает Claude на этапе, что просим у Дмитрия и что будет после ✓ — для строки над кнопками (22.10.2026) */
const DOING = { 2: 'пишет детали с 2–3 вариантами формы', 3: 'собирает прототип: все строки с числами и раскладку словами', 4: 'собирает картинку в Figma', 5: 'пишет фактуру для текста и делает EN-копию картинки' };
const ASK = { 2: 'Прочитай детали, выбери форму и нажми ✓', 3: 'Проверь прототип: строки, числа, раскладку', 4: 'Доведи картинку и нажми ✓', 5: 'Проверь фактуру' };
const AFTER_YES = { 2: 'Claude соберёт прототип', 3: 'Claude соберёт картинку в Figma', 4: 'Claude напишет фактуру и сделает EN-копию', 5: 'текст пишешь ты: RU, потом EN' };
const RUN = 'Claude двигает карточки, когда ты нажимаешь «Двигай» вверху пульта или пишешь ему «двигай конвейер».';
const CONV_REQ = '_pult/conveyor_request.json', CONV_STATE = '_pult/conveyor_state.json'; // кнопка «Двигай» (23.10.2026)
const PREF_KEY = 'pult:prefs:v2';
const MARKS_KEY = 'pult:marks:v1'; // неотправленные замечания к месту в тексте — только в этом браузере
const TOKEN_KEY = 'pult:gh-token';

const S = {
  files: [], units: [], by: {}, theses: [], thesesBy: {}, became: {}, root: MAC_ROOT, today: null,
  view: 'ideas', f: { pillar: 'all', src: 'all', hidden: false, cmt: false, noPosted: true, mine: false }, q: '', drafts: {},
  ideasKind: 'idea', sort: 'id', planOffset: 0, rateMode: 'duel', rateKind: 'idea',
  tbl: { k: 'rank', dir: -1 }, expand: {}, drawer: null, dragKey: null, pair: null, lastPair: null,
  lastLoad: 0, loaded: false, loading: false,
  forms: null, formBy: {}, formsErr: null, formsLoading: false, ff: { fam: 'all', tier: 'all' },
  pick: null, pickVia: null, pickFrom: null, // выбор формы для поста: путь поста, откуда пришли, с какого экрана
  marks: (() => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}') || {}; } catch (e) { return {}; } })(), sel: null,
};

/* ---------- настройки вида: только удобство, правда — в файлах ---------- */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    for (const k of ['view', 'ideasKind', 'sort', 'rateMode', 'rateKind']) if (p[k]) S[k] = p[k];
    if (p.f) Object.assign(S.f, p.f);
    if (p.ff) Object.assign(S.ff, p.ff);
    if (!SORTS.some(s => s[0] === S.sort)) S.sort = 'id';
    if (S.view === 'rate') S.view = 'ideas'; // экран «Оценка» снят 21.10.2026
  } catch (e) { /* хранилище недоступно */ }
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ view: S.view, ideasKind: S.ideasKind, sort: S.sort, rateMode: S.rateMode, rateKind: S.rateKind, f: S.f, ff: S.ff })); } catch (e) { /* нет хранилища */ }
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
  // замечание к месту: «📍 «цитата»», что не так — строками ниже
  for (const c of out) { const q = c.text.match(/^📍 «(.*)»$/); if (q) { c.quote = q[1]; c.note = c.more.join('\n'); } }
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
    // конвейер 2.0: польза для читателя, ♻️/🆕, исходник, оговорка, партия
    benefit: ((stripComments(body).match(/\*\*Польза\.\*\*\s*(.+)/) || [])[1] || '').replace(/\*\*|__|`/g, '').trim() || null,
    ikind: fields.kind ? String(fields.kind) : null,
    source_post: fields.source_post ? String(fields.source_post) : null,
    fit: fields.fit ? String(fields.fit) : null,
    batch: asDate(fields.batch),
    // этап 3: варианты формы от Claude (первый — рекомендованный) и выбор Дмитрия
    form_options: (Array.isArray(fields.form_options) ? fields.form_options : String(fields.form_options || '').split(/[,\s]+/)).map(formId).filter(Boolean),
    format_pick: formId(fields.format_pick),
    comments: parseComments(body),
  };
  u.cmtOpen = u.comments.filter(c => !c.done).length;
  if (kind === 'idea') u.post_ref = fields.post ? String(fields.post) : null;
  if (kind === 'post') {
    u.published = Object.fromEntries(CH.map(c => [c.k, fields['published_' + c.k] === true]));
    u.published_date = asDate(fields.published_date) || asDate(fields.published_en_date) || asDate(fields.published_ru_date) || (status === 'опубликован' ? u.date : null);
    u.pubOn = Object.fromEntries(CH.filter(c => u.published[c.k]).map(c => [c.k, asDate(fields[`published_${c.k}_date`]) || u.published_date]));
    u.stats = {};
    for (const k of STAT_KEYS) { const n = asNum(fields[k]); if (n != null) u.stats[k] = n; }
    u.idea_ref = (String(fields.idea || '').match(/I-\d{3}/) || [null])[0];
    const st = parseInt(String(fields.stage ?? ''), 10);
    u.step = STEPS[st] ? st : null;
    u.turn = fields.turn ? String(fields.turn).trim() : null;
    u.was_stage = STEPS[asNum(fields.was_stage)] ? asNum(fields.was_stage) : null;
  }
  u.archived_on = asDate(fields.archived);
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
  async forms() {
    const r = await fetch('api/forms', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'пульт отдаёт библиотеку форм с версии 21.10 — перезапусти ярлык «Пульт контента»' : 'код ' + r.status);
    return r.json();
  },
  async conveyor(start = false) {
    const r = await fetch('api/conveyor', start ? { method: 'POST' } : { cache: 'no-store' });
    if (r.status === 404) throw new Error('кнопка «Двигай» работает с версии 23.10 — перезапусти ярлык «Пульт контента»');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  },
  conveyorStart: () => Local.conveyor(true),
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
  async forms() {
    const r = await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/contents/${FORMS_PATH}?ref=${GH_REPO.branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
    if (!r.ok) throw new Error('GitHub не отдал библиотеку: ' + r.status);
    return r.json();
  },
  async rawJson(path) {
    const r = await GH.api(`/repos/${GH_REPO.owner}/${GH_REPO.repo}/contents/${encPath(path)}?ref=${GH_REPO.branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
    if (r.status === 404) return {};
    if (!r.ok) throw new Error('GitHub: ' + r.status);
    try { return await r.json(); } catch (e) { return {}; }
  },
  async conveyor() {
    const [state, request] = await Promise.all([GH.rawJson(CONV_STATE), GH.rawJson(CONV_REQ)]);
    return { state, request };
  },
  /* просьба «Двигай» — файлом в репо: мак забирает её синхронизацией и открывает сессию (conveyor.py) */
  async conveyorStart() {
    const url = `/repos/${GH_REPO.owner}/${GH_REPO.repo}/contents/${encPath(CONV_REQ)}`;
    const cur = await GH.api(`${url}?ref=${GH_REPO.branch}`);
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const request = { id: new Date().toISOString(), from: /iPhone|iPad|Android/.test(navigator.userAgent) ? 'телефон' : 'браузер' };
    const r = await GH.api(url, { method: 'PUT', body: JSON.stringify({ message: 'пульт: двигай конвейер', content: b64enc(JSON.stringify(request, null, 2) + '\n'), sha, branch: GH_REPO.branch }) });
    if (!r.ok) throw new Error((await r.json()).message || r.status);
    return { ok: true, state: (S.conv && S.conv.state) || {}, request };
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
    refreshConv();
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
  // поля конвейера: в карточке под этими именами другое (stage — статус, archived — признак), прежнее значение — из файла
  if (['stage', 'turn', 'was', 'was_stage', 'archived', 'published_date'].includes(k) || k.startsWith('published_') || STAT_KEYS.includes(k)) return FM.read(u.text).fields[k] ?? null;
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
    if (k === 'format_pick' && !/^V-\d{2,3}$/.test(v)) throw new Error('форма — номер вида V-12');
    if (k === 'stage' && !/^[2-6] \S/.test(v)) throw new Error('этап — от 2 до 6');
    if (k === 'turn' && !['claude', 'дмитрий'].includes(v)) throw new Error('ход — claude или дмитрий');
    if (k === 'my_score') { v = Number(v); if (!(v >= 1 && v <= 5)) throw new Error('оценка — от 1 до 5'); }
    if (k === 'my_elo' || k === 'my_duels') { v = Math.round(Number(v)); if (!(v >= 0)) throw new Error(`${k}: нужно число`); }
    if (k === 'published_date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('дата должна быть ГГГГ-ММ-ДД');
    if (STAT_KEYS.includes(k)) { v = asNum(v); if (!(v >= 0)) throw new Error('охват — целое число от 0'); v = Math.round(v); }
    out[k] = v;
  }
  return out;
}
function commitMessage(u, fields) {
  const parts = Object.entries(fields).map(([k, v]) => ({
    status: `статус → ${v}`, plan_date: v ? `в план на ${v}` : 'убран из плана', my_score: v ? `оценка ${v}` : 'оценка снята',
    pillar: `пиллар ${normPillar(v) || 'снят'}`, my_elo: 'дуэль', format_pick: v ? `форма ${v}` : 'форма снята',
    stage: v ? `этап → ${v}` : null, published_date: v ? `вышел ${v}` : 'дата выхода снята',
  })[k] || (k.startsWith('published_') && CH.find(c => k === 'published_' + c.k) ? `${CH.find(c => k === 'published_' + c.k).name} ${v ? 'да' : 'нет'}` : null)
    || (STAT_KEYS.includes(k) ? `${k} ${v ?? '—'}` : null)).filter(Boolean);
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
  if (u.batch) return 'batch';
  return 'cards';
}
const srcName = u => (SRC.find(x => x[0] === srcGroup(u)) || [])[1];
function pass(u) { return passIn(u, S.f.hidden); }
/* те же фильтры; hidden — пропускать ли отклонённое и архив (воронке нужны отсеянные при любом фильтре) */
function passIn(u, hidden) {
  if (!hidden && (u.stage === 'отклонено' || u.archived)) return false;
  if (S.f.pillar !== 'all' && (S.f.pillar === 'none' ? !!u.pillar : u.pillar !== S.f.pillar)) return false;
  if (S.f.src !== 'all' && srcGroup(u) !== S.f.src) return false;
  if (S.f.cmt && !u.cmtOpen) return false;
  if (S.f.mine && !waitsMe(u)) return false;
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
  else if (inWork(u)) { const l = laneOf(u); t.push(`<span class="tag ${l.who === 'me' ? 'yellow' : ''}" title="${l.who === 'me' ? 'Ход твой' : 'Ход Claude'}">${l.n} · ${STEPS[l.n]} · ${whoName(l)}</span>`); }
  else if (u.kind === 'post' || u.status !== 'новая') t.push(`<span class="tag">${esc(u.status)}</span>`);
  if (u.thesis) t.push(`<span class="tag" title="${esc(u.thesis_title || '')}">${esc(u.thesis)}</span>`);
  if (u.ikind === 'перепозиционирование') t.push(`<span class="tag" title="Перепозиционирование вышедшего поста">♻️${u.source_post ? ' ' + esc(u.source_post) : ''}</span>`);
  else if (u.ikind === 'новое') t.push(`<span class="tag">🆕 новое</span>`);
  if (u.fit === 'с оговоркой') t.push(`<span class="tag" title="Оговорка по стратегии — в карточке">⚠️ с оговоркой</span>`);
  if (u.kind === 'idea') t.push(`<span class="tag">${u.batch ? 'партия ' + dShort(u.batch) : esc(srcName(u))}</span>`);
  if (u.plan_date) t.push(`<span class="tag green">${icon('calendar-days')}${dShort(u.plan_date)}</span>`);
  if (u.kind === 'post' && u.published_date && u.stage === 'опубликован') t.push(`<span class="tag" title="Когда и где вышел">${icon('megaphone')}${dShort(u.published_date)}${chShort(u) ? ' · ' + chShort(u) : ''}</span>`);
  if (u.cmtOpen) t.push(`<span class="tag cmt" title="Комментарии, которые Claude ещё не учёл">${icon('message-circle')}${u.cmtOpen}</span>`);
  return `<div class="tags">${t.join('')}</div>`;
}
/* карточка идёт по этапам 2–6: пост конвейера или взятая идея, по которой пост ещё не заведён */
const inWork = u => { const l = laneOf(u); return !!l && l.n >= 2 && l.n <= TEXT_STEP; };
/* дорожка этапов в карточке: пройденные — галочкой, текущий — с тем, чей ход */
function pathHtml(u) {
  const l = laneOf(u);
  if (!l || !l.n) return '';
  return `<ol class="path" aria-label="Этапы">${LANES.map(x => `<li class="${x.n < l.n ? 'done' : x.n === l.n ? 'cur ' + (l.who || '') : ''}">${x.n < l.n ? icon('check') : `<span class="pn">${x.n}</span>`}<span>${esc(x.name)}</span>${x.n === l.n && l.who ? `<span class="pw">${whoName(l)}</span>` : ''}</li>`).join('')}</ol>`;
}
function cardHtml(u) {
  return `<article class="card" data-open="${esc(u.path)}">
    <div class="row"><span class="uid">${esc(u.id)}</span>${pillarHtml(u)}</div>
    <h3>${esc(u.title)}</h3>
    ${u.benefit ? `<p class="pv benefit"><b>Польза.</b> ${esc(u.benefit)}</p>` : u.preview ? `<p class="pv">${esc(u.preview)}</p>` : ''}
    ${tagsHtml(u)}
  </article>`;
}
function miniHtml(u, { drag = true, note = '' } = {}) {
  return `<div class="mini${drag ? '' : ' static'}" ${drag ? `draggable="true" data-drag="${esc(u.path)}"` : ''} data-open="${esc(u.path)}">
    <div class="row"><span class="uid">${esc(u.id)}</span><span class="pdot" style="background:var(--p-${u.pillar || 'none'})" title="${esc(PMAP[u.pillar] ? pName(PMAP[u.pillar]) : 'без пиллара')}"></span>
      <span class="r">${u.cmtOpen ? `<span class="tag cmt" title="Комментарии, которые Claude ещё не учёл">${icon('message-circle')}${u.cmtOpen}</span>` : ''}${u.plan_date ? `<span class="tag green">${icon('calendar-days')}${dShort(u.plan_date)}</span>` : ''}${u.my_score ? `<span title="Твоя оценка">★${u.my_score}</span>` : ''}</span></div>
    <div class="t">${esc(u.title)}</div>${note ? `<div class="mnote">${esc(note)}</div>` : ''}
  </div>`;
}

/* ---------- фильтры и шапка ---------- */
function renderWhere() {
  const where = $('#where');
  if (!where) return;
  where.innerHTML = MODE === 'gh'
    ? `<span class="where" title="Правки уходят коммитами в ${GH_REPO.owner}/${GH_REPO.repo}, оттуда — на мак">${icon('cloud')}GitHub</span>${GH.token ? `<button class="iconbtn" id="logout" title="Выйти" aria-label="Выйти">${icon('log-out')}</button>` : ''}`
    : `<span class="where" title="Правки пишутся в файлы на этом маке">${icon('hard-drive')}На маке</span>`;
  renderConv();
}

/* ---------- кнопка «Двигай»: сессия Claude на маке, видна и с телефона (conveyor.py, 23.10.2026) ---------- */
function convPhase(c) {
  if (!c) return S.convErr ? 'idle' : 'none';
  const st = c.state || {}, req = c.request || {};
  if (st.running) return 'run';
  if (req.id && req.id !== st.handled) return 'wait'; // просьба ушла, мак её ещё не забрал
  return 'idle';
}
const hm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
const dm = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getDate()} ${MON[d.getMonth()]}`; };
function renderConv() {
  const el = $('#conv');
  if (!el) return;
  const ph = convPhase(S.conv), st = (S.conv && S.conv.state) || {};
  if (!S.loaded || (MODE === 'gh' && !GH.token) || ph === 'none') { el.innerHTML = ''; return; }
  const last = st.started && !st.running ? ` Прошлая сессия: ${dm(st.started)}, ${hm(st.started)}${st.ended ? `–${hm(st.ended)}` : ''}.` : '';
  el.innerHTML = ph === 'run'
    ? `<button class="convst run" id="conv-info" title="Сессия «${esc(st.session)}» открыта с ${hm(st.started)}"><span class="live"></span>Claude работает</button>`
    : ph === 'wait'
      ? `<button class="convst wait" id="conv-info" title="Просьба ушла, мак её ещё не забрал">${icon('hourglass')}Ждём мак</button>`
      : `<button class="btn primary convgo" id="conv-go" title="${esc('Открыть на маке сессию Claude: он разберёт всё, что ждёт его. Сессию видно в приложении Claude на телефоне.' + last)}">${icon('play')}Двигай</button>`;
  icons();
}
async function refreshConv() {
  try { S.conv = await Store.conveyor(); S.convErr = null; }
  catch (e) { S.conv = null; S.convErr = e.message; }
  renderConv();
  convPoll();
}
/* пока ждём мак или сессия идёт — проверяем сами, чтобы кнопка сменилась без ↻ */
function convPoll(ms) {
  clearTimeout(S.convTimer);
  const ph = convPhase(S.conv);
  if (ph === 'wait' || ph === 'run') S.convTimer = setTimeout(refreshConv, ms || (ph === 'wait' ? 20000 : 60000));
}
async function convGo() {
  const n = S.units.filter(u => (laneOf(u) || {}).who === 'claude').length;
  if (!confirm(`Открыть на маке сессию Claude?\n\nОн разберёт всё, что ждёт его${n ? ` (карточек: ${n})` : ''}. Сессию видно в приложении Claude на телефоне, отвечать можно оттуда.${MODE === 'gh' ? '\n\nМак заметит просьбу в течение 2–4 минут, если он включён и не спит.' : ''}`)) return;
  const btn = $('#conv-go');
  if (btn) btn.disabled = true;
  try {
    const r = await Store.conveyorStart();
    S.conv = { state: r.state, request: r.request };
    S.convErr = null;
    if (MODE === 'gh') toast('Просьба ушла. Мак откроет сессию в течение 2–4 минут, если он включён и не спит.', { ms: 9000 });
    else if (r.ok) toast(`Сессия «${r.state.session}» открылась в Терминале. На телефоне она в приложении Claude.`, { ms: 9000 });
    else toast('Сессия уже открыта: пиши в неё.', { kind: 'warn' });
  } catch (e) { toast('Не получилось: ' + e.message, { kind: 'err' }); if (btn) btn.disabled = false; return; }
  renderConv();
  convPoll(MODE === 'gh' ? 20000 : 5000); // GitHub отдаёт свежий файл не сразу: перечитываем позже
}
function convInfo() {
  const st = (S.conv && S.conv.state) || {};
  if (convPhase(S.conv) === 'run') toast(`Сессия «${st.session}» открыта с ${hm(st.started)}. Пиши ей в приложении Claude или в Терминале на маке. Закрыть — напиши ей «закрывай».${st.waiting ? ' Ещё одна просьба «Двигай» ждёт: начнётся, когда эту закроют.' : ''}`, { ms: 12000 });
  else toast('Просьба ушла на GitHub. Мак заберёт её при синхронизации (раз в 2 минуты) и откроет сессию. Если мак выключен или спит — когда проснётся.', { ms: 12000 });
}
function renderFilters() {
  $('#filters').classList.toggle('static', S.view === 'forms'); // у форм фишек много: не липнут к верху
  if (S.view === 'forms') { $('#filters').innerHTML = formFiltersHtml(); filtersTail(); return; }
  const base = S.units.filter(u => S.f.hidden || !(u.stage === 'отклонено' || u.archived));
  const cnt = k => base.filter(u => (k === 'none' ? !u.pillar : u.pillar === k)).length;
  const pchips = [['all', 'Все', null, base.length], ...PILLARS.map(p => [p.code, pName(p), p.code, cnt(p.code)]), ['none', 'Без пиллара', 'none', cnt('none')]];
  const scnt = k => base.filter(u => k === 'all' || srcGroup(u) === k).length;
  $('#filters').innerHTML = `
    <div class="fgroup"><span class="flabel">Пиллар</span>${pchips.map(([k, n, c, x]) => `<button class="chip" data-f="pillar" data-v="${k}" aria-pressed="${S.f.pillar === k}">${c ? `<span class="pdot" style="background:var(--p-${c})"></span>` : ''}${esc(n)}<span class="c">${x}</span></button>`).join('')}</div>
    <div class="fgroup"><span class="flabel">Откуда</span>${SRC.map(([k, n]) => `<button class="chip" data-f="src" data-v="${k}" aria-pressed="${S.f.src === k}">${esc(n)}<span class="c">${scnt(k)}</span></button>`).join('')}</div>
    <label class="toggle"><input type="checkbox" id="noposted" ${S.f.noPosted ? 'checked' : ''}>Скрыть идеи, ставшие постами<span class="c">${S.units.filter(becamePost).length}</span></label>
    <label class="toggle"><input type="checkbox" id="hidden" ${S.f.hidden ? 'checked' : ''}>Показать отклонённые и архив</label>
    <label class="toggle"><input type="checkbox" id="cmtonly" ${S.f.cmt ? 'checked' : ''}>${icon('message-circle')}Только с комментариями, которые Claude ещё не учёл<span class="c">${S.units.filter(u => u.cmtOpen).length}</span></label>
    <label class="toggle"><input type="checkbox" id="mine" ${S.f.mine ? 'checked' : ''}>${icon('hand')}Только ждут твоего решения<span class="c">${S.units.filter(waitsMe).length}</span></label>`;
  filtersTail();
}
function filtersTail() {
  const ideas = S.units.filter(u => u.kind === 'idea' && ['идея', 'в работе'].includes(u.stage) && !becamePost(u)).length;
  const live = S.units.filter(u => u.kind === 'post' && !u.archived && ['идея', 'в работе', 'черновик', 'готов'].includes(u.stage)).length;
  $('#counts').textContent = `${ideas} идей в банке · ${live} постов в работе · ждут тебя ${S.units.filter(waitsMe).length}`;
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

/* ---------- экран «Формы»: библиотека форм для картинок постов (21.10.2026) ---------- */
async function loadForms() {
  if (S.forms || S.formsLoading) return;
  S.formsLoading = true;
  try {
    const lib = await Store.forms();
    S.forms = lib;
    S.formBy = Object.fromEntries(lib.forms.map(f => [f.id, f]));
    S.formsErr = null;
  } catch (e) { S.formsErr = e.message; }
  finally { S.formsLoading = false; }
  render();
}
function formPass(f, skip = '') {
  if (skip !== 'fam' && S.ff.fam !== 'all' && f.fam !== S.ff.fam) return false;
  if (skip !== 'tier' && S.ff.tier !== 'all' && f.tier !== S.ff.tier) return false;
  if (S.q) {
    const hay = [f.id, f.name, f.thought, f.how, f.use, f.ours, f.src].join(' ').toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
  }
  return true;
}
function formFiltersHtml() {
  const L = S.forms;
  if (!L) return '';
  const nf = k => L.forms.filter(f => formPass(f, 'fam') && (k === 'all' || f.fam === k)).length;
  const nt = k => L.forms.filter(f => formPass(f, 'tier') && (k === 'all' || f.tier === k)).length;
  return `
    <div class="fgroup"><span class="flabel">Что хочешь сказать</span>${[['all', '', 'Все'], ...L.families.map(x => [x.id, x.icon, x.name])].map(([k, ic, n]) => `<button class="chip" data-ff="${k}" aria-pressed="${S.ff.fam === k}">${ic ? `<span class="ficon">${ic}</span>` : ''}${esc(n)}<span class="c">${nf(k)}</span></button>`).join('')}</div>
    <div class="fgroup"><span class="flabel">Как работала у нас</span>${[['all', '', 'Любая'], ...Object.entries(L.tiers).map(([k, v]) => [k, v.icon, v.name])].map(([k, ic, n]) => `<button class="chip" data-ft="${k}" aria-pressed="${S.ff.tier === k}">${ic ? `<span class="ficon">${ic}</span>` : ''}${esc(n)}<span class="c">${nt(k)}</span></button>`).join('')}</div>`;
}
const flagMark = x => (S.forms.flags[x] || '').split(' ')[0];
function formCardHtml(f) {
  const T = S.forms.tiers[f.tier];
  return `<article class="card fcard" data-form="${f.id}">
    <div class="fsvg">${f.svg}</div>
    <div class="row"><span class="uid">${f.id}</span><span class="spacer"></span>${f.flags.map(x => `<span class="fflag" data-tip="${esc(S.forms.flags[x])}">${flagMark(x)}</span>`).join('')}<span class="fflag" data-tip="${esc(T.name)}">${T.icon}</span></div>
    <h3>${esc(f.name)}</h3>
    <p class="pv">${esc(f.thought)}</p>
  </article>`;
}
function formsList() { return S.forms ? S.forms.forms.filter(f => formPass(f)) : []; }
function renderForms() {
  if (!S.forms) {
    if (!S.formsErr) loadForms();
    return `<div class="empty">${S.formsErr ? `Не удалось загрузить библиотеку форм: ${esc(S.formsErr)}.<br><button class="btn" data-formsretry>${icon('rotate-cw')}Ещё раз</button>` : 'Загружаю библиотеку форм…'}</div>`;
  }
  const L = S.forms;
  const list = formsList();
  const pu = S.pick && S.pickVia === 'lib' ? S.by[S.pick] : null;
  const bar = pu ? `<div class="note pickbar">${icon('mouse-pointer-click')}<span>Выбираешь форму для <b>${esc(pu.id)}</b> «${esc(pu.title)}». Открой форму и нажми «Взять эту».</span><button class="btn" data-pickcancel>${icon('x')}Отмена</button></div>` : '';
  const head = `<div class="viewhead"><h1>Формы</h1><span class="hint">${list.length} из ${L.count} · схема — силуэт: что форма утверждает, пока подписей нет</span></div>${bar}`;
  if (!list.length) return head + '<div class="empty">Под фильтр ничего не попало.</div>';
  if (S.ff.fam !== 'all' || S.q) return head + `<div class="grid forms">${list.map(formCardHtml).join('')}</div>`;
  return head + L.families.map(fm => {
    const items = list.filter(f => f.fam === fm.id);
    return items.length ? `<h2 class="fam-h"><span class="ficon">${fm.icon}</span>${esc(fm.name)}<span class="c">${items.length}</span></h2><div class="grid forms">${items.map(formCardHtml).join('')}</div>` : '';
  }).join('');
}
/* карточка формы в боковой панели; в режиме выбора внизу кнопка «Взять эту» */
function renderFormDrawer(fresh) {
  const id = S.drawer.slice(5);
  const f = S.formBy[id];
  if (!f) { if (!S.forms && !S.formsErr) loadForms(); else closeDrawer(); return; }
  const sig = S.drawer + '|' + (S.pick || '');
  if (!fresh && $('.drawer') && S.drawn === sig) return;
  S.drawn = sig;
  const fm = S.forms.families.find(x => x.id === f.fam);
  const T = S.forms.tiers[f.tier];
  const pu = S.pick ? S.by[S.pick] : null;
  const rows = [['Как устроена', f.how], ['Ёмкость', f.units], ['Как применить у нас', f.use], ['Наши выпуски', f.ours], ['Доказательства', f.ev], ['Чем рискуем', f.risk], ['Откуда форма', f.src]];
  $('#drawer-root').innerHTML = `<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-label="${esc(f.id + ' ' + f.name)}">
    <div class="dhead"><div class="row"><span class="uid">${f.id}</span><span class="kind">${esc(fm ? fm.name : '')}</span><span class="spacer"></span>
      <button class="iconbtn" data-formstep="-1" title="Предыдущая (←)" aria-label="Предыдущая форма">${icon('chevron-left')}</button>
      <button class="iconbtn" data-formstep="1" title="Следующая (→)" aria-label="Следующая форма">${icon('chevron-right')}</button>
      <button class="iconbtn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <h2>${esc(f.name)}</h2></div>
    <div class="dbody">
      <div class="fbig">${f.svg}</div>
      <p class="fthought">${esc(f.thought)}</p>
      <div class="tags"><span class="tag ${TIER_TAG[f.tier] || ''}">${T.icon} ${esc(T.name)}</span>${f.flags.map(x => `<span class="tag">${esc(S.forms.flags[x])}</span>`).join('')}</div>
      <dl class="fdl">${rows.filter(r => r[1] && r[1] !== '—').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>
    ${pu ? `<div class="decide"><div class="dnow">Форма картинки для ${esc(pu.id)} · ${esc(pu.title)}</div>
      <div class="dbtns two">${S.pickVia === 'drawer' ? `<button class="dbtn" data-backpost>${icon('arrow-left')}К посту</button>` : `<button class="dbtn" data-close>Смотреть дальше</button>`}
      <button class="dbtn yes" data-pickform="${f.id}" aria-pressed="${pu.format_pick === f.id}">${icon('check')}${pu.format_pick === f.id ? 'Уже выбрана' : 'Взять эту'}</button></div></div>` : ''}
  </aside>`;
  icons();
}
function formStep(d) {
  const list = formsList();
  const i = list.findIndex(f => 'form:' + f.id === S.drawer);
  if (i < 0 || !list.length) return;
  openDrawer('form:' + list[(i + d + list.length) % list.length].id);
}
/* текст поста конвейера по этапам: «## N · …» — этап, остальное (черновик до конвейера, «Как делали», статистика) — хвост.
   Открыт только текущий этап, под ним выбор формы; пройденные и хвост свёрнуты (Дмитрий 22.10: «стооолько текста в карточке») */
function stageParts(body) {
  const st = {}, rest = [];
  let cur = null;
  const empty = n => !st[n].slice(1).some(s => s.trim());
  for (const s of body.split('\n')) {
    const m = s.match(/^## ([2-6]) · /);
    if (m) { cur = +m[1]; st[cur] = [s]; continue; }
    if (typeof cur === 'number' && (/^## /.test(s) || (/^---\s*$/.test(s) && (cur === TEXT_STEP || empty(cur))))) cur = 'rest';
    if (cur === null) { if (s.trim()) rest.push(s); continue; }
    (cur === 'rest' ? rest : st[cur]).push(s);
  }
  return { st, rest };
}
const mdWords = lines => lines.join('\n').replace(/<!--[\s\S]*?-->/g, ' ').split('\n').filter(s => !/^#{1,6} |^---\s*$/.test(s)).join(' ').replace(/[|*_`>#:-]+/g, ' ').split(/\s+/).filter(Boolean).length;
function stagedBodyHtml(u, body) {
  const { st, rest } = stageParts(body);
  if (!st[u.step]) return null; // файл не по этапам — показываем как есть
  const fold = (cls, title, lines) => `<details class="stage ${cls}"><summary>${esc(title)}</summary><div class="md">${mdToHtml(lines.join('\n'))}</div></details>`;
  const out = [];
  for (const n of Object.keys(st).map(Number).sort((a, b) => a - b)) {
    const body = st[n].slice(1), w = mdWords(body);
    if (n === u.step) out.push(`<div class="md">${mdToHtml(st[n].join('\n'))}</div>`, formBlockHtml(u));
    else if (w && n < u.step) out.push(fold('done', `${n} · ${STEPS[n]} · готово`, body));
    else if (w) out.push(fold('later', `${n} · ${STEPS[n]} · заготовка`, body));
  }
  const rw = mdWords(rest);
  if (rw) out.push(fold('rest', `Остальное в файле: черновик и служебное · ${rw.toLocaleString('ru-RU')} слов`, rest));
  return out.join('');
}

/* блок в карточке поста: 2–3 варианта формы от Claude большими плитками + выбор из библиотеки */
function formBlockHtml(u) {
  const live = u.kind === 'post' && !u.archived && u.stage !== 'опубликован';
  if (!u.form_options.length && !u.format_pick && !live) return '';
  if (!S.forms && !S.formsErr) loadForms();
  const ids = [...u.form_options];
  if (u.format_pick && !ids.includes(u.format_pick)) ids.unshift(u.format_pick);
  const tile = (id, i) => {
    const f = S.formBy[id] || { id, name: S.forms ? 'нет в библиотеке' : '…', thought: '', svg: '' };
    const on = u.format_pick === id;
    return `<div class="fopt${on ? ' on' : ''}">
      <button class="fsvg" data-form="${id}" title="Открыть карточку формы">${f.svg}</button>
      <div class="fo-t"><span class="uid">${id}</span>${i === 0 && u.form_options[0] === id && u.form_options.length > 1 ? '<span class="tag green">рекомендую</span>' : ''}</div>
      <b>${esc(f.name)}</b>${f.thought ? `<p>${esc(f.thought)}</p>` : ''}
      <button class="dbtn${on ? ' yes' : ''}" data-setform="${on ? '' : id}">${on ? icon('check') + 'Выбрана' : 'Эту'}</button>
    </div>`;
  };
  return `<div class="fblock"><p class="section-l">Форма картинки · этап ${FORM_STEP}</p>
    ${ids.length ? `<div class="fopts">${ids.map(tile).join('')}</div>` : '<p class="hint">Вариантов от Claude пока нет. Можно выбрать самому.</p>'}
    <div class="inline"><button class="btn" data-openlib="${esc(u.path)}">${icon('shapes')}Выбрать из библиотеки</button>${u.format_pick ? '<span class="hint">Нажми на выбранную ещё раз, чтобы снять выбор</span>' : ''}</div>
  </div>`;
}

/* ---------- экран «Конвейер»: колонки — этапы, в колонке сверху «ждут тебя», ниже «у Claude» (22.10.2026) ---------- */
/* где карточка: n — этап (0 — пост со старым статусом без этапа), who — чей ход; null — вне конвейера */
function laneOf(u) {
  if (u.archived || u.stage === 'отклонено' || becamePost(u)) return null;
  if (u.kind === 'idea') {
    if (u.status === 'в работе') return { n: 2, who: 'claude' }; // взята, пост с «Деталями» ещё не заведён
    if (u.status === 'отложена') return { n: 1, who: 'park' };
    return { n: 1, who: u.cmtOpen ? 'claude' : 'me' };
  }
  if (u.stage === 'опубликован') return { n: OUT_LANE, who: null };
  if (u.step === TEXT_STEP) return { n: TEXT_STEP, who: 'me' }; // текст пишет Дмитрий
  if (u.step) return { n: u.step, who: postWaits(u) ? 'me' : 'claude' };
  return { n: 0, who: null };
}
const laneSort = n => (n === OUT_LANE
  ? (a, b) => String(b.published_date || '').localeCompare(String(a.published_date || '')) || (a.id < b.id ? 1 : -1)
  : (a, b) => String(a.plan_date || '9999').localeCompare(String(b.plan_date || '9999')) || (a.id < b.id ? -1 : 1));
/* раскладка по этапам: { n: { all: [...], me: [...], claude: [...], park: [...] } } */
function laneMap(units) {
  const m = {};
  [NO_LANE, ...LANES].forEach(l => { m[l.n] = { all: [], me: [], claude: [], park: [] }; });
  units.forEach(u => { const l = laneOf(u); if (!l) return; m[l.n].all.push(u); if (l.who) m[l.n][l.who].push(u); });
  return m;
}
/* откуда отсеяна карточка: идея — на отборе, пост — с этапа was_stage */
const dropStep = u => (u.kind === 'idea' ? (u.status === 'отклонена' ? 1 : null) : (u.archived ? u.was_stage : null));
function renderBoard() {
  const units = S.units.filter(pass);
  const m = laneMap(units);
  const lanes = [...(m[0].all.length ? [NO_LANE] : []), ...LANES];
  // сверху отсеянное конвейером 2.0 (идеи партий и посты с этапа), ниже старый архив, свежее — выше
  const fresh = u => (dropStep(u) && (u.kind === 'post' || u.batch) ? 0 : 1);
  const out = S.f.hidden ? units.filter(u => (u.archived || u.stage === 'отклонено') && !becamePost(u))
    .sort((a, b) => fresh(a) - fresh(b) || String(b.archived_on || '').localeCompare(String(a.archived_on || '')) || (a.id < b.id ? 1 : -1)) : [];
  const cols = [...lanes.map(l => ({ ...l, items: m[l.n].all })), ...(S.f.hidden ? [{ n: 'out', name: 'Отсеяно и архив', icon: 'archive', items: out }] : [])];
  const strip = lanes.map(l => {
    const x = m[l.n];
    return `<button class="ls${x.all.length ? '' : ' zero'}" data-lane="${l.n}" title="${esc(`${l.name}: ${x.all.length}${x.me.length ? ` · ждут тебя ${x.me.length}` : ''}${x.claude.length ? ` · у Claude ${x.claude.length}` : ''}`)}">
      ${l.n ? `<span class="ls-n">${l.n}</span>` : ''}${esc(l.name)}<b>${x.all.length}</b>${x.me.length && l.n < TEXT_STEP ? `<span class="ls-me">${x.me.length}</span>` : ''}</button>`;
  }).join(`<span class="ls-arr">${icon('chevron-right')}</span>`);
  const minis = (items, key, note) => {
    const lim = S.expand[key] ? items.length : LIMIT;
    return items.slice(0, lim).map(u => miniHtml(u, { drag: false, note: note ? note(u) : '' })).join('')
      + (items.length > lim ? `<button class="more" data-expand="${key}">ещё ${items.length - lim}</button>` : '');
  };
  const outNote = u => { const s = dropStep(u); return s === 1 ? 'отсеяна на отборе' : s ? `отсеян на этапе «${STEPS[s]}»` : 'архив'; };
  const col = c => {
    let body;
    if (!c.items.length) body = '<p class="lempty">пусто</p>';
    else if (c.n === 'out') body = minis(c.items, 'lane:out', outNote);
    else if (c.n === OUT_LANE || c.n === 0) body = minis(c.items.sort(laneSort(c.n)), `lane:${c.n}`);
    else {
      body = ['me', 'claude', 'park'].filter(w => m[c.n][w].length).map(w => {
        const items = m[c.n][w].sort(laneSort(c.n));
        return `<div class="lgroup ${w}">${c.n === TEXT_STEP && w === 'me' ? 'Пишешь ты' : WHO[w]}<span class="n">${items.length}</span></div>${minis(items, `lane:${c.n}:${w}`)}`;
      }).join('');
    }
    const me = c.n >= 1 && c.n < TEXT_STEP ? m[c.n].me.length : 0;
    return `<section class="col lane${c.items.length ? '' : ' empty'}" id="lane-${c.n}">
      <div class="colhead">${icon(c.icon)}<span>${typeof c.n === 'number' && c.n ? c.n + ' · ' : ''}${esc(c.name)}</span><span class="n">${c.items.length}</span></div>
      ${me ? `<button class="btn walk" data-walk="${c.n}">${icon('play')}Пройти ${me}</button>` : ''}
      <div class="colbody" data-scroll="lane:${c.n}">${body}</div></section>`;
  };
  const width = c => (c.items.length ? 'minmax(220px, 1fr)' : 'minmax(118px, .5fr)'); // пустой этап уже, но виден: воронка целиком
  return `<div class="viewhead"><h1>Конвейер</h1><span class="hint">Колонка — этап. Сверху в колонке то, что ждёт твоего решения, ниже — что делаю я. Карточку двигают только кнопки в ней: ✓ берём, ✎ доработать, ✕ нафиг.</span></div>
    <div class="lanes-strip">${strip}</div>
    <div class="board" style="grid-template-columns:${cols.map(width).join(' ')}">${cols.map(col).join('')}</div>`;
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
      <span class="val">${r.label}</span>${r.note ? `<span class="hnote">${esc(r.note)}</span>` : ''}</div>`).join('')}</div>`;
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
  // воронка конвейера 2.0: где карточки сейчас и сколько отсеяно на каждом этапе; «Вышло» — только посты, прошедшие этапы
  const m = laneMap(S.units.filter(pass));
  const dropped = {};
  S.units.filter(u => passIn(u, true) && (u.kind === 'post' || u.batch)).forEach(u => { const s = dropStep(u); if (s) dropped[s] = (dropped[s] || 0) + 1; });
  const sum = w => LANES.filter(l => l.n < TEXT_STEP).reduce((a, l) => a + m[l.n][w].length, 0);
  const kpis = [
    ['На отборе', m[1].all.length, 'идеи'], ['Ждут тебя', sum('me'), 'решить в пульте'], ['У Claude', sum('claude'), 'делаю я'],
    ['Пишешь текст', m[TEXT_STEP].all.length, `этап ${TEXT_STEP}`], ['Вышло за 30 дней', pub30.length, 'по дате публикации'], ['В плане на 2 недели', plan14.length, 'с датой в шапке'],
  ];
  const funnel = LANES.map(l => {
    const x = m[l.n];
    const v = l.n === OUT_LANE ? x.all.filter(u => u.step).length : x.all.length;
    const bits = [x.me.length && l.n < OUT_LANE ? `${l.n === TEXT_STEP ? 'пишешь ты' : 'ждут тебя'} ${x.me.length}` : '', x.claude.length ? `у Claude ${x.claude.length}` : '', dropped[l.n] ? `отсеяно ${dropped[l.n]}` : ''].filter(Boolean);
    return { name: `${l.n} ${l.name}`, v, me: x.me.length, claude: x.claude.length, out: dropped[l.n] || 0, label: `<b>${v}</b>`, note: bits.join(' · '), tip: `${l.name}: ${v}${bits.length ? '<br>' + bits.join('<br>') : ''}` };
  });
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
  // площадки: частота — по дате площадки, охват — медиана по постам, где цифра внесена
  const noCh = pub.filter(u => !chShort(u)).length;
  const median = a => (a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null);
  const chRows = CH.map(c => {
    const on = pub.filter(u => u.pubOn && u.pubOn[c.k]), d = u => u.pubOn[c.k];
    const last = on.map(d).filter(Boolean).sort().pop() || null;
    const vals = on.map(u => u.stats[c.reach]).filter(v => v != null).sort((a, b) => a - b);
    return { c, on, last, vals, med: median(vals), n30: on.filter(u => d(u) >= since(30)).length, n90: on.filter(u => d(u) >= since(90)).length,
      strip: weeks.map(w => ({ w, items: on.filter(u => d(u) && d(u) >= isoOf(w.ws) && d(u) <= isoOf(w.we)) })) };
  });
  const nf = v => Math.round(v).toLocaleString('ru-RU');
  // дата в будущем — отложенная публикация (с 23.10: пост ставят в отложку и отмечают сразу)
  const ago = iso => { const n = Math.round((today - dateOf(iso)) / 864e5); return n === 0 ? 'сегодня' : n === 1 ? 'вчера' : n === -1 ? 'завтра' : n < 0 ? `через ${-n} дн.` : `${n} дн. назад`; };
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
      <div class="panel"><h3>Конвейер</h3><p class="sub">Сколько карточек сейчас на каждом этапе, чей ход и сколько отсеяно. «Вышло» — посты, прошедшие этапы с 21.10. Сколько дней карточка стоит на этапе, пока не считаем: дат переходов в файлах нет.</p>
        ${hbars(funnel)}
        <details><summary>Таблицей</summary>${tableHtml(['Этап', 'Сейчас', 'Ждут тебя', 'У Claude', 'Отсеяно'], funnel.map(f => [f.name, f.v, f.me, f.claude, f.out]))}</details></div>
      <div class="panel"><h3>Ритм публикаций</h3><p class="sub">Постов в неделю за полгода, по дате публикации.${noDate ? ` У ${noDate} опубликованных даты нет — они не попали в график.` : ''}</p>
        ${rhythm}
        <details><summary>Таблицей</summary>${tableHtml(['Неделя', 'Постов', 'Какие'], weeks.filter(w => w.items.length).map(w => [`${dShort(isoOf(w.ws))} — ${dShort(isoOf(w.we))}`, w.items.length, w.items.map(u => u.id).join(', ')]))}</details></div>
      <div class="panel wide"><h3>Площадки: частота и охват</h3><p class="sub">Полоса — те же 26 недель, что в ритме: светлая клетка — один пост на площадке, тёмная — два и больше. Охват — медиана на пост среди постов с цифрой: у LinkedIn показы, у остальных просмотры, поэтому площадки между собой по нему не сравнивать.${noCh ? ` У ${noCh} опубликованных площадка не отмечена.` : ''}</p>
        <table class="tbl"><thead><tr><th>Площадка</th><th>26 недель</th><th class="num">За 30 дней</th><th class="num">За 90 дней</th><th class="num">В неделю за 90</th><th>Последний</th><th class="num">Охват, медиана</th></tr></thead>
        <tbody>${chRows.map(r => `<tr><td>${esc(r.c.name)}</td><td><div class="strip">${r.strip.map(x => `<i class="l${Math.min(x.items.length, 2)}" data-tip="${esc(`<b>${dShort(isoOf(x.w.ws))} — ${dShort(isoOf(x.w.we))}</b>: ${x.items.length}${x.items.length ? '<br>' + x.items.map(u => esc(u.id + ' ' + u.title.slice(0, 48))).join('<br>') : ''}`)}"></i>`).join('')}</div></td>
          <td class="num mono">${r.n30}</td><td class="num mono">${r.n90}</td><td class="num mono">${(r.n90 / 13).toFixed(1).replace('.', ',')}</td>
          <td class="mono">${r.last ? `${dShort(r.last)} <span class="faint">${ago(r.last)}</span>` : '—'}</td>
          <td class="num mono">${r.med != null ? `${nf(r.med)} <span class="faint">по ${r.vals.length} из ${r.on.length}</span>` : `<span class="faint">нет цифр</span>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel wide"><h3>Тезисы и покрытие</h3><p class="sub">${zero} из ${th.length} тезисов без опубликованного поста. Сверху — самые недокрытые.</p>
        <table class="tbl"><thead><tr><th>Тезис</th><th>Пиллар</th><th class="num">Идей</th><th class="num">Постов</th><th class="num">Вышло</th></tr></thead>
        <tbody>${th.slice(0, thLim).map(r => `<tr data-q="${esc(r.t.id)}"><td class="title"><div><span class="uid">${esc(r.t.id)}</span> ${esc(r.t.title)}</div></td><td>${pillarHtml({ pillar: r.t.pillar })}</td><td class="num mono">${r.ideas}</td><td class="num mono">${r.posts}</td><td class="num mono">${r.pub || '<span class="faint">0</span>'}</td></tr>`).join('')}</tbody></table>
        ${th.length > thLim ? `<p style="text-align:center"><button class="btn" data-expand="theses">Все ${th.length}</button></p>` : ''}
        <p class="sub" style="margin-top:8px">Клик по тезису — поиск его идей и постов на экране «Идеи».</p></div>
      <div class="panel wide"><h3>Результативность</h3>
        <div class="note">${icon('info')}<span>Цифры охвата внесены у ${perf.length} из ${pub.length} опубликованных постов. График появится, когда цифр станет больше — сейчас по ним нельзя сравнивать пиллары или форматы.</span></div>
        ${perf.length ? `<table class="tbl"><thead><tr><th>Пост</th><th>Вышел</th><th>Где</th><th class="num">Показы LI</th><th class="num">Реакции</th><th class="num">Комм.</th><th class="num">Сохр.</th><th class="num">Вовлечённость</th><th class="num">Просм. TG</th><th class="num">Просм. FB</th></tr></thead>
        <tbody>${perf.map(u => `<tr data-open="${esc(u.path)}"><td class="title"><div><span class="uid">${esc(u.id)}</span> ${esc(u.title)}</div></td><td class="mono">${dShort(u.published_date)}</td><td class="mono">${chShort(u) || '—'}</td>
          ${['li_impressions', 'li_reactions', 'li_comments', 'li_saves'].map(k => `<td class="num mono">${u.stats[k] ?? '—'}</td>`).join('')}<td class="num mono">${er(u) != null ? (er(u) * 100).toFixed(1).replace('.', ',') + ' %' : '—'}</td><td class="num mono">${u.stats.tg_views ?? '—'}</td><td class="num mono">${u.stats.fb_views ?? '—'}</td></tr>`).join('')}</tbody></table>` : ''}
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
/* ---------- замечания к месту в тексте: выделил кусок → «Замечание» → место подсвечено с номером (Дмитрий 22.10.2026) ----------
   Копятся в браузере и уходят Claude одной записью: «Доработать» или вместе с решением. В файле — обычный комментарий «📍 «цитата»». */
const marksOf = u => S.marks[u.path] || [];
function saveMarks() { try { localStorage.setItem(MARKS_KEY, JSON.stringify(S.marks)); } catch (e) { /* нет хранилища: живут до перезагрузки */ } }
/* открытые замечания карточки по порядку: сначала отправленные (ждут Claude), потом неотправленные; n — номер на подсветке */
function openMarks(u) {
  const sent = u.comments.filter(c => !c.done && c.quote).map(c => ({ q: c.quote, note: c.note, sent: true }));
  return [...sent, ...marksOf(u).map((m, i) => ({ q: m.q, note: m.note, sent: false, i }))].map((m, k) => ({ ...m, n: k + 1 }));
}
const markEntry = m => `📍 «${m.q}»${m.note ? '\n' + m.note : ''}`;
const cut = (s, n) => (s.length > n ? s.slice(0, n).trim() + '…' : s);
function marksListHtml(u) {
  const ms = openMarks(u).filter(m => !m.sent);
  return ms.length ? `<ol class="mlist">${ms.map(m => `<li><span class="mn">${m.n}</span><span class="mt">«${esc(cut(m.q, 90))}»${m.note ? ` — ${esc(m.note)}` : ''}</span><button class="iconbtn" data-unmark="${m.i}" aria-label="Убрать замечание">${icon('x')}</button></li>`).join('')}</ol>` : '';
}
/* карточка без кнопок решения (ход Claude, вне конвейера): отдельная кнопка отправки */
function marksBarHtml(u) {
  if (canDecide(u) || !marksOf(u).length) return '';
  return `<div class="decide"><div class="dnow">Не отправлены Claude: ${marksOf(u).length}</div>${marksListHtml(u)}<button class="dbtn yes" data-sendmarks>${icon('send')}Отправить замечания</button></div>`;
}
/* подсветка: ищем цитату по тексту карточки без учёта пробелов (выделение через ячейки таблицы даёт табы и переводы строк) */
function markText(roots, m) {
  const want = m.q.replace(/…$/, '').replace(/\s+/g, '');
  if (want.length < 2) return null;
  for (const root of roots) {
    let s = '';
    const at = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (n.parentElement.closest('.cmn')) continue;
      for (let i = 0; i < n.data.length; i++) if (!/\s/.test(n.data[i])) { s += n.data[i]; at.push([n, i]); }
    }
    const k = s.indexOf(want);
    if (k < 0) continue;
    const spans = new Map();
    for (let j = k; j < k + want.length; j++) { const [n, i] = at[j]; const r = spans.get(n); spans.set(n, r ? [r[0], i] : [i, i]); }
    let first = null, last = null;
    for (const [n, [a, b]] of spans) {
      const r = document.createRange();
      r.setStart(n, a); r.setEnd(n, b + 1);
      const el = document.createElement('mark');
      el.className = 'cm' + (m.sent ? '' : ' draft');
      el.dataset.mk = m.n;
      el.title = m.note || 'Вопрос к этому месту';
      r.surroundContents(el);
      first = first || el; last = el;
    }
    last.insertAdjacentHTML('afterend', `<sup class="cmn${m.sent ? '' : ' draft'}" data-mk="${m.n}">${m.n}</sup>`);
    return first;
  }
  return null;
}
function paintMarks(u) {
  const roots = $$('.drawer .dbody .md');
  for (const m of openMarks(u)) {
    const el = markText(roots, m);
    const d = el && el.closest('details');
    if (d) d.open = true; // замечание в свёрнутом блоке — блок раскрыт, чтобы его было видно
  }
}
/* выделение в тексте карточки → плавающая кнопка «Замечание» под ним */
function selMark() {
  const btn = $('#markbtn');
  if (!btn) return;
  const hide = () => { btn.hidden = true; S.sel = null; };
  const sel = getSelection();
  if (!S.by[S.drawer] || !sel || sel.isCollapsed || !sel.rangeCount) return hide();
  const r = sel.getRangeAt(0);
  const el = n => (n.nodeType === 1 ? n : n.parentElement);
  if (!el(r.startContainer)?.closest('.drawer .dbody .md') || !el(r.endContainer)?.closest('.drawer .dbody')) return hide();
  const q = sel.toString().replace(/\s+/g, ' ').trim();
  if (q.replace(/\s/g, '').length < 2) return hide();
  S.sel = { path: S.drawer, q: cut(q, 400) };
  const rc = r.getBoundingClientRect();
  btn.hidden = false;
  const w = btn.offsetWidth, h = btn.offsetHeight;
  let y = rc.bottom + 10;
  if (y + h > innerHeight - 96) y = Math.max(8, rc.top - h - 10);
  btn.style.left = Math.min(Math.max(8, rc.left + rc.width / 2 - w / 2), innerWidth - w - 8) + 'px';
  btn.style.top = y + 'px';
}
function openMarkBox(u, q) {
  $('#d-mark')?.remove();
  const dec = $$('.drawer .decide');
  dec.forEach(d => { d.hidden = true; });
  $('.drawer').insertAdjacentHTML('beforeend', `<div class="decide dmark" id="d-mark">
    <div class="mq">«${esc(cut(q, 180))}»</div>
    <textarea id="d-mark-t" rows="2" placeholder="Что не так с этим местом? Можно пусто — тогда это просто вопрос к месту"></textarea>
    <div class="dbtns two"><button class="dbtn" id="d-mark-cancel">Отмена</button><button class="dbtn yes" id="d-mark-add">${icon('message-square-plus')}Добавить</button></div>
  </div>`);
  icons();
  const ta = $('#d-mark-t');
  ta.focus();
  const close = () => { $('#d-mark')?.remove(); dec.forEach(d => { d.hidden = false; }); };
  const add = () => {
    (S.marks[u.path] = S.marks[u.path] || []).push({ q, note: ta.value.trim() });
    saveMarks();
    close();
    renderDrawer();
    toast(`Замечание ${openMarks(S.by[u.path]).length} отмечено. Уйдёт Claude с «Доработать» или вместе с решением`);
  };
  $('#d-mark-cancel').onclick = close;
  $('#d-mark-add').onclick = add;
  ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } if (e.key === 'Escape') close(); };
}
document.body.insertAdjacentHTML('beforeend', `<button class="markbtn" id="markbtn" hidden>${icon('message-square-plus')}Замечание</button>`);
$('#markbtn').addEventListener('pointerdown', e => e.preventDefault()); // клик не снимает выделение
$('#markbtn').addEventListener('click', () => {
  const s = S.sel;
  $('#markbtn').hidden = true;
  getSelection().removeAllRanges();
  if (s && S.by[s.path] && S.drawer === s.path) openMarkBox(S.by[s.path], s.q);
});
document.addEventListener('selectionchange', () => { clearTimeout(S.selT); S.selT = setTimeout(selMark, 150); });

function commentsHtml(u, withInput = true) {
  const num = new Map(openMarks(u).filter(m => m.sent).map(m => [m.q, m.n]));
  const list = u.comments.map(c => `<div class="cmt ${c.done ? 'done' : ''}">
      <div class="cmeta">${c.done ? `${icon('check-check')}учтено` : `${icon('clock')}ждёт Claude`}<span>${dShort(c.date)}${c.time ? ' ' + c.time : ''}</span></div>
      ${c.quote ? `<div class="cquote">${!c.done && num.has(c.quote) ? `<span class="mn">${num.get(c.quote)}</span>` : ''}«${esc(cut(c.quote, 160))}»</div><div class="ctext">${esc(c.note || 'Вопрос к этому месту')}</div>`
        : `<div class="ctext">${esc([c.text, ...c.more].join('\n'))}</div>`}
      ${c.replies.map(r => `<div class="creply">${icon('corner-down-right')}${esc(r)}</div>`).join('')}
    </div>`).join('');
  if (!withInput) return list ? `<div class="cmts"><p class="section-l">Комментарии для Claude</p>${list}</div>` : '';
  return `<div class="cmts"><p class="section-l">Комментарии для Claude</p>
    ${list}
    <textarea id="d-cmt" rows="3" placeholder="Что Claude учесть по этой ${u.kind === 'idea' ? 'идее' : 'заметке'}: поправить угол, связать с другой идеей, не брать…"></textarea>
    <div class="inline"><button class="btn primary" id="d-cmt-send">${icon('send')}Отправить</button>
      <span class="hint faint">Cmd+Enter. Запишется в файл, Claude заберёт при следующей работе с контентом.</span></div>
  </div>`;
}
function stampNow() { const d = new Date(); return `${isoOf(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
/* комментарий и неотправленные замечания карточки — одной записью в файл */
function sendComment(u0, val0) {
  const val = (val0 ?? ($('#d-cmt')?.value || '')).trim();
  const path = u0.path;
  const marks = [...marksOf(u0)];
  const items = [...marks.map(markEntry), ...(val ? [val] : [])];
  if (!items.length) return;
  enqueue(path, async () => {
    const u = S.by[path];
    const prev = u.text;
    const stamp = stampNow(), entries = [];
    let text = u.text;
    for (const it of items) { const r = addComment(text, it, stamp); text = r.text; entries.push(r.entry); }
    const what = marks.length ? `замечаний: ${marks.length}${val ? ' и комментарий' : ''}` : 'комментарий';
    let ver;
    try { ver = await Store.write(u, text, `пульт: ${u.id} ${marks.length ? `замечания к тексту (${marks.length})` : 'комментарий для Claude'}`); }
    catch (e) {
      if (e instanceof Conflict) { replaceFile(e.file); render(); toast('Файл поменяли в другом месте. Показываю свежую версию — отправь ещё раз, текст и замечания сохранены.', { kind: 'warn' }); return; }
      toast(MODE === 'gh' ? `GitHub не принял комментарий: ${e.message}` : 'Пульт не отвечает. Окно терминала с пультом открыто?', { kind: 'err' });
      return;
    }
    delete S.drafts[path];
    if (marks.length) { delete S.marks[path]; saveMarks(); }
    replaceFile({ path, text, ver });
    render();
    toast(`${u.id}: ${what} — записано ${Store.label}`, { undo: () => enqueue(path, async () => {
      const cur = S.by[path];
      // файл с тех пор не меняли — вернуть как было; меняли — убрать только эти записи
      const back = cur.text === text ? prev : entries.reduce((t, en) => t.replace('\n' + en, ''), cur.text);
      try {
        const v = await Store.write(cur, back, `пульт: ${cur.id} комментарий отменён`);
        replaceFile({ path, text: back, ver: v });
        S.drafts[path] = val;
        if (marks.length) { S.marks[path] = marks; saveMarks(); }
        render(); toast('Отменено: замечания снова не отправлены');
      } catch (e) { toast('Не вышло отменить — удали комментарий в Обсидиане', { kind: 'err' }); }
    }) });
  });
}
function closeDrawer() { S.drawer = null; S.fixOpen = null; S.walk = null; if (S.pickVia === 'drawer') S.pick = S.pickVia = null; $('#drawer-root').innerHTML = ''; }
function openDrawer(key) { const fresh = S.drawer !== key; S.drawer = key; if (fresh) S.fixOpen = null; renderDrawer(fresh); }
/* ---------- отбор идей: три кнопки и сразу следующая карточка (конвейер 2.0, 21.10.2026) ---------- */
const DECIDE_OFF = ['стала постом', 'архив'];
const undecided = u => u.kind === 'idea' && u.status === 'новая' && !u.cmtOpen && !u.archived;
/* пост ждёт решения Дмитрия: этап 2–5, ход его, нет комментария, который Claude ещё не учёл (✏️ = ход Claude) */
const postWaits = u => u.kind === 'post' && u.step >= 2 && u.step < TEXT_STEP && !u.archived && u.turn === 'дмитрий' && !u.cmtOpen;
const waitsMe = u => undecided(u) || postWaits(u);
const canDecide = u => (u.kind === 'idea' ? !DECIDE_OFF.includes(u.status) : postWaits(u));
function openNext(path) {
  // порядок — как на экране «Идеи»: те же фильтры и сортировка; идея ведёт к идее, пост — к посту
  const kind = (S.by[path] || {}).kind || 'idea';
  // «Пройти» в колонке конвейера: посты только этого этапа (S.walk)
  const walk = kind === 'post' ? S.walk : null;
  const want = kind === 'idea' ? undecided : walk ? x => postWaits(x) && x.step === walk : postWaits;
  const list = S.units.filter(x => x.kind === kind && pass(x)).sort(sorter(S.sort));
  const i = list.findIndex(x => x.path === path);
  const next = list.slice(i + 1).find(want) || list.slice(0, Math.max(i, 0)).find(want);
  if (next) openDrawer(next.path);
  else { closeDrawer(); toast(kind === 'idea' ? 'На отборе больше ничего нет' : walk ? `На этапе «${STEPS[walk]}» больше ничего не ждёт тебя` : 'Больше ни один пост не ждёт тебя'); }
}
function decidePost(u, how) {
  if (how === 'yes') {
    if (u.step === FORM_STEP && !u.format_pick) { toast('Сначала выбери форму: «Эту» под плиткой или из библиотеки', { kind: 'warn' }); $('.fblock')?.scrollIntoView({ behavior: 'smooth' }); return; }
    openNext(u.path);
    save(u, { stage: stepVal(u.step + 1), turn: 'claude' }, { label: `${u.id}: берём, дальше «${STEPS[u.step + 1]}». Записано ${Store.label}` });
    return;
  }
  openNext(u.path);
  save(u, { status: 'архив', was: u.status, was_stage: u.step, archived: S.today }, { label: `${u.id}: в архив с этапа «${STEPS[u.step]}». Записано ${Store.label}` });
}
function decide(u, status) {
  const label = status === 'в работе' ? 'берём' : 'не подходит';
  openNext(u.path);
  save(u, { status }, { label: `${u.id}: ${label}. Записано ${Store.label}` });
}
function decideHtml(u) {
  if (u.kind === 'post') return postDecideHtml(u);
  if (DECIDE_OFF.includes(u.status) || becamePost(u)) return '';
  // взята: кнопок нет — ход Claude, Дмитрию ничего делать не нужно (22.10.2026)
  if (u.status === 'в работе') return `<div class="decide"><div class="dnow">Берём. Дальше Claude заводит пост и ${DOING[FORM_STEP]}. От тебя ничего: когда будет готово, пост появится в «Ждут тебя». ${RUN}</div>
    <button class="btn ghost dundo" data-retake>${icon('undo-2')}Передумал — вернуть на отбор</button></div>`;
  const now = u.status === 'отклонена' ? 'Решение: не подходит · можно поменять'
    : u.cmtOpen ? 'На доработке: комментарий ждёт Claude · можно поменять' : `✓ — Claude заведёт пост: ${DOING[FORM_STEP].replace('пишет', 'распишет')}`;
  return `<div class="decide" id="decide">
    <div class="dnow">${esc(now)}</div>
    <div class="dbtns" id="d-btns">
      <button class="dbtn no" data-decide="отклонена" aria-pressed="${u.status === 'отклонена'}">${icon('x')}Нафиг</button>
      <button class="dbtn fix" data-decide="fix" aria-pressed="${u.status === 'новая' && u.cmtOpen > 0}">${icon('pencil')}Доработать${marksOf(u).length ? ` · ${marksOf(u).length}` : ''}</button>
      <button class="dbtn yes" data-decide="в работе" aria-pressed="${u.status === 'в работе'}">${icon('check')}Берём</button>
    </div>
    <div class="dfix" id="d-fix-box" hidden>
      ${marksListHtml(u)}
      <textarea id="d-fix" rows="3" placeholder="${marksOf(u).length ? 'Общий комментарий — по желанию' : 'Как доработать: уже, другой исходник, соединить с другой идеей…'}"></textarea>
      <div class="dbtns two"><button class="dbtn" id="d-fix-cancel">Отмена</button><button class="dbtn yes" id="d-fix-send">${icon('send')}Отправить</button></div>
    </div>
  </div>`;
}
function postDecideHtml(u) {
  if (!u.step || u.archived || u.stage === 'опубликован') return '';
  if (!postWaits(u)) {
    const why = u.cmtOpen ? `На доработке: Claude переделывает по твоему комментарию. ${RUN}`
      : u.step === TEXT_STEP ? 'Этап «Текст» твой: пишешь по фактуре и выкладываешь. Вышло — пришли Claude тексты, как вышли.'
        : `Ход Claude: ${DOING[u.step]}. От тебя ничего: когда будет готово, пост появится в «Ждут тебя». ${RUN}`;
    return `<div class="decide"><div class="dnow">${esc(why)}</div></div>`;
  }
  const yes = u.step === FORM_STEP && u.format_pick ? `Берём ${u.format_pick}` : 'Берём';
  return `<div class="decide" id="decide">
    <div class="dnow">${esc(ASK[u.step])}${u.step === FORM_STEP && !u.format_pick ? ' · форма ещё не выбрана' : ''}. После ✓ — ${esc(AFTER_YES[u.step])}.</div>
    <div class="dbtns" id="d-btns">
      <button class="dbtn no" data-decide="no">${icon('x')}Нафиг</button>
      <button class="dbtn fix" data-decide="fix">${icon('pencil')}Доработать${marksOf(u).length ? ` · ${marksOf(u).length}` : ''}</button>
      <button class="dbtn yes" data-decide="yes">${icon('check')}${esc(yes)}</button>
    </div>
    <div class="dfix" id="d-fix-box" hidden>
      ${marksListHtml(u)}
      <textarea id="d-fix" rows="3" placeholder="${marksOf(u).length ? 'Общий комментарий — по желанию' : 'Что поправить на этом этапе: другой пример, убрать пункт, сменить угол…'}"></textarea>
      <div class="dbtns two"><button class="dbtn" id="d-fix-cancel">Отмена</button><button class="dbtn yes" id="d-fix-send">${icon('send')}Отправить</button></div>
    </div>
  </div>`;
}
function renderDrawer(fresh = false) {
  if (String(S.drawer).startsWith('form:')) { renderFormDrawer(fresh); return; }
  const u = S.by[S.drawer];
  if (!u) { closeDrawer(); return; }
  // файл не менялся — не перерисовывать: запись соседней карточки не должна сбивать ввод в этой
  const sig = u.text + (S.forms ? '|f' : '') + '|' + JSON.stringify(marksOf(u));
  if (!fresh && $('.drawer') && S.drawn === sig) return;
  S.drawn = sig;
  const prevScroll = fresh ? 0 : ($('.dbody')?.scrollTop || 0);
  const statuses = u.kind === 'idea' ? IDEA_STATUSES : POST_STATUSES;
  const lead = u.kind === 'idea' || !!u.step; // идея и пост конвейера: сначала текст, поля свёрнуты
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
    if (u.step) meta.push(['Этап', `${u.step} · ${STEPS[u.step]} · ${postWaits(u) ? 'ждёт тебя' : 'ход Claude'}`]);
  }
  meta.push(['Файл', u.path]);
  const ghUrl = `https://github.com/${GH_REPO.owner}/${GH_REPO.repo}/blob/${GH_REPO.branch}/${encPath(u.path)}`;
  $('#drawer-root').innerHTML = `<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-label="${esc(u.id)}">
    <div class="dhead"><div class="row"><span class="uid">${esc(u.id)}</span><span class="kind">${u.kind === 'idea' ? 'идея' : 'пост'}</span>${pillarHtml(u)}<span class="spacer"></span>
      <a class="linkbtn obs" href="obsidian://open?path=${encodeURIComponent(S.root + '/' + u.path)}" title="Откроется на маке, где стоит Обсидиан">${icon('external-link')}Обсидиан</a>
      ${MODE === 'gh' ? `<a class="linkbtn" href="${ghUrl}" target="_blank" rel="noopener" title="Файл в репозитории — там же правка текста">${icon('file-code')}GitHub</a>` : ''}
      <button class="iconbtn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <h2>${esc(u.title)}</h2></div>
    <div class="dbody">
      ${pathHtml(u)}
      ${u.kind === 'post' && !u.step ? formBlockHtml(u) : ''}
      ${lead ? `${(u.step && stagedBodyHtml(u, stripComments(u.body))) || `<div class="md">${mdToHtml(stripComments(u.body).replace(/^\s*# .*\n/, ''))}</div>${formBlockHtml(u)}`}${commentsHtml(u, !canDecide(u))}<details class="more"><summary>Статус, пиллар, файл</summary>` : ''}
      <div class="fields">
        <span class="k">Статус</span><select class="sel" id="d-status">${statuses.map(s => `<option ${s === u.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}${statuses.includes(u.status) ? '' : `<option selected disabled>${esc(u.status)}</option>`}</select>
        <span class="k">Пиллар</span><div class="inline"><select class="sel" id="d-pillar"><option value="">— не задан</option>${PILLARS.map(p => `<option value="${p.code}" ${u.pillar === p.code ? 'selected' : ''}>${esc(pName(p))}</option>`).join('')}</select>${u.pillar_inherited ? '<span class="faint">взят из тезиса, в файле пусто</span>' : ''}</div>
        <span class="k">Дата в плане</span><div class="inline"><input type="date" id="d-plan" value="${u.plan_date || ''}">${u.plan_date ? `<button class="btn ghost" id="d-plan-clear">${icon('x')}Убрать</button>` : ''}</div>
        ${u.kind === 'post' ? `<span class="k">Где вышел</span><div class="inline">${CH.map(c => `<button class="chip" data-ch="${c.k}" aria-pressed="${!!u.published[c.k]}">${c.name}</button>`).join('')}</div>
        <span class="k">Дата выхода</span><div class="inline"><input type="date" id="d-pub" value="${asDate(rawOf(u, 'published_date')) || ''}">${CH.filter(c => u.pubOn[c.k] && u.pubOn[c.k] !== u.published_date).map(c => `<span class="faint">${c.name} — ${dShort(u.pubOn[c.k])}</span>`).join('')}</div>
        ${CH.filter(c => u.published[c.k]).map(c => `<span class="k">Охват ${c.short}</span><div class="inline stats">${c.stats.map(([k, l]) => `<label title="${k}"><input type="number" min="0" step="1" data-stat="${k}" value="${u.stats[k] ?? ''}" placeholder="—"><span>${l}</span></label>`).join('')}</div>`).join('')}` : ''}
      </div>
      <div class="fields">${meta.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
      ${lead ? '</details>' : `${commentsHtml(u)}
      <div><p class="section-l">Текст файла</p><div class="md">${mdToHtml(stripComments(u.body))}</div></div>`}
    </div>
    ${decideHtml(u)}${marksBarHtml(u)}
  </aside>`;
  icons();
  fillImages($('#drawer-root'));
  paintMarks(u);
  const db = $('.dbody');
  if (db) db.scrollTop = prevScroll;
  $('#d-status').onchange = e => save(u, { status: e.target.value }, { label: `${u.id}: статус «${e.target.value}». Записано ${Store.label}` });
  $('#d-pillar').onchange = e => save(u, { pillar: e.target.value || null }, { label: `${u.id}: пиллар ${e.target.value ? pShort(e.target.value) : 'снят'}. Записано ${Store.label}` });
  $('#d-plan').onchange = e => save(u, { plan_date: e.target.value || null }, { label: e.target.value ? `${u.id} в плане на ${dShort(e.target.value)}` : `${u.id} убран из плана` });
  // площадка: первая отметка ставит статус «опубликован» и дату выхода сегодня, если их нет
  $$('[data-ch]').forEach(b => { b.onclick = () => {
    const c = CH.find(x => x.k === b.dataset.ch), on = !u.published[c.k], f = { ['published_' + c.k]: on };
    if (on && !asDate(rawOf(u, 'published_date'))) f.published_date = S.today;
    if (on && u.status !== 'опубликован') f.status = 'опубликован';
    save(u, f, { label: `${u.id}: ${c.name} — ${on ? 'вышел' : 'снято'}${f.status ? ', статус «опубликован»' : ''}. Записано ${Store.label}` });
  }; });
  const dp = $('#d-pub');
  if (dp) dp.onchange = e => save(u, { published_date: e.target.value || null }, { label: e.target.value ? `${u.id}: вышел ${dShort(e.target.value)}` : `${u.id}: дата выхода снята` });
  $$('[data-stat]').forEach(inp => { inp.onchange = () => save(u, { [inp.dataset.stat]: inp.value === '' ? null : inp.value }, { label: `${u.id}: ${inp.dataset.stat} ${inp.value || '—'}. Записано ${Store.label}` }); });
  const clr = $('#d-plan-clear');
  if (clr) clr.onclick = () => save(u, { plan_date: null }, { label: `${u.id} убран из плана` });
  const ta = $('#d-cmt');
  if (ta) {
    ta.value = S.drafts[u.path] || '';
    ta.oninput = () => { S.drafts[u.path] = ta.value; };
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(u); } };
    $('#d-cmt-send').onclick = () => sendComment(u);
  }
  const rt = $('[data-retake]');
  if (rt) rt.onclick = () => save(u, { status: 'новая' }, { label: `${u.id}: вернул на отбор. Записано ${Store.label}` });
  const box = $('#d-fix-box');
  if (box) {
    const fix = $('#d-fix');
    const send = () => { const v = fix.value.trim(); if (!v && !marksOf(u).length) { fix.focus(); return; } S.drafts[u.path] = v; S.fixOpen = null; sendComment(u, v); openNext(u.path); };
    $$('#d-btns [data-decide]').forEach(b => { b.onclick = () => {
      if (b.dataset.decide !== 'fix') {
        // неотправленные замечания уходят вместе с решением; «Берём» без формы — не решение, замечания ждут
        const blocked = u.kind === 'post' && b.dataset.decide === 'yes' && u.step === FORM_STEP && !u.format_pick;
        if (!blocked && marksOf(u).length) sendComment(u, '');
        if (u.kind === 'post') decidePost(u, b.dataset.decide); else decide(u, b.dataset.decide);
        return;
      }
      S.fixOpen = u.path; $('#d-btns').hidden = true; box.hidden = false; fix.value = S.drafts[u.path] || ''; fix.focus();
    }; });
    if (S.fixOpen === u.path) { $('#d-btns').hidden = true; box.hidden = false; fix.value = S.drafts[u.path] || ''; }
    fix.oninput = () => { S.drafts[u.path] = fix.value; };
    fix.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } };
    $('#d-fix-send').onclick = send;
    $('#d-fix-cancel').onclick = () => { S.fixOpen = null; box.hidden = true; $('#d-btns').hidden = false; };
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
  const v = { ideas: renderIdeas, board: renderBoard, plan: renderPlan, forms: renderForms, stats: renderStats }[S.view] || renderIdeas;
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
  if (t.closest('#conv-go')) { convGo(); return; }
  if (t.closest('#conv-info')) { convInfo(); return; }
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
  if (tab) { S.view = tab.dataset.view; S.pick = S.pickVia = null; savePrefs(); render(); window.scrollTo(0, 0); return; }
  /* библиотека форм и выбор формы для поста */
  const ffam = t.closest('[data-ff]');
  if (ffam) { S.ff.fam = ffam.dataset.ff; savePrefs(); render(); return; }
  const ftier = t.closest('[data-ft]');
  if (ftier) { S.ff.tier = ftier.dataset.ft; savePrefs(); render(); return; }
  if (t.closest('[data-formsretry]')) { S.formsErr = null; render(); return; }
  const fst = t.closest('[data-formstep]');
  if (fst) { formStep(Number(fst.dataset.formstep)); return; }
  const fo = t.closest('[data-form]');
  if (fo) {
    const host = S.by[S.drawer];
    if (host) { S.pick = host.path; S.pickVia = 'drawer'; } // плитка в карточке поста: «К посту» вернёт назад
    openDrawer('form:' + fo.dataset.form);
    return;
  }
  const lib = t.closest('[data-openlib]');
  if (lib) { S.pick = lib.dataset.openlib; S.pickVia = 'lib'; S.pickFrom = S.view; S.drawer = null; $('#drawer-root').innerHTML = ''; S.view = 'forms'; render(); window.scrollTo(0, 0); return; }
  if (t.closest('[data-backpost]')) { const p = S.pick; S.pick = S.pickVia = null; openDrawer(p); return; }
  if (t.closest('[data-pickcancel]')) { const p = S.pick; S.view = S.pickFrom || 'ideas'; S.pick = S.pickVia = null; savePrefs(); render(); if (S.by[p]) openDrawer(p); return; }
  const pf = t.closest('[data-pickform]');
  if (pf) {
    const u = S.by[S.pick];
    if (!u) return;
    const back = S.pickVia === 'lib' ? (S.pickFrom || 'ideas') : null;
    S.pick = S.pickVia = null;
    if (back) { S.view = back; savePrefs(); render(); }
    openDrawer(u.path);
    if (u.format_pick !== pf.dataset.pickform) save(u, { format_pick: pf.dataset.pickform }, { label: `${u.id}: форма ${pf.dataset.pickform}. Записано ${Store.label}` });
    return;
  }
  /* замечания к месту в тексте */
  const um = t.closest('[data-unmark]');
  if (um) { const u = S.by[S.drawer]; if (!u) return; marksOf(u).splice(Number(um.dataset.unmark), 1); if (!marksOf(u).length) delete S.marks[u.path]; saveMarks(); renderDrawer(); return; }
  if (t.closest('[data-sendmarks]')) { const u = S.by[S.drawer]; if (u) sendComment(u, ''); return; }
  const mk = t.closest('mark.cm, sup.cmn');
  if (mk && !String(getSelection())) { const u = S.by[S.drawer]; const m = u && openMarks(u)[Number(mk.dataset.mk) - 1]; if (m) toast(`${m.n}. ${m.note || 'Вопрос к этому месту'}${m.sent ? ' · ждёт Claude' : ' · не отправлено'}`); return; }
  const sf = t.closest('[data-setform]');
  if (sf) {
    const u = S.by[S.drawer];
    if (!u) return;
    const v = sf.dataset.setform || null;
    save(u, { format_pick: v }, { label: v ? `${u.id}: форма ${v}. Записано ${Store.label}` : `${u.id}: выбор формы снят` });
    return;
  }
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
  const ln = t.closest('[data-lane]');
  if (ln) { $('#lane-' + ln.dataset.lane)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); return; }
  const wk = t.closest('[data-walk]');
  if (wk) {
    const n = Number(wk.dataset.walk);
    const kind = n === 1 ? 'idea' : 'post';
    const first = S.units.filter(x => x.kind === kind && pass(x) && (n === 1 ? undecided(x) : postWaits(x) && x.step === n)).sort(sorter(S.sort))[0];
    if (first) { openDrawer(first.path); S.walk = n === 1 ? null : n; }
    return;
  }
  const op = t.closest('[data-open]');
  if (op && !t.closest('select, input, a')) { if (!t.closest('.drawer')) S.walk = null; openDrawer(op.dataset.open); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'hidden') { S.f.hidden = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'cmtonly') { S.f.cmt = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'mine') { S.f.mine = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'noposted') { S.f.noPosted = e.target.checked; savePrefs(); render(); }
  if (e.target.id === 'sort') { S.sort = e.target.value; savePrefs(); render(); }
});
let qTimer;
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 150); });
$('#reload').addEventListener('click', async () => { if (S.view === 'forms') { S.forms = null; S.formsErr = null; } if (await load()) toast(MODE === 'gh' ? 'Данные с GitHub обновлены' : 'Файлы перечитаны', { ms: 2000 }); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.drawer) { closeDrawer(); return; }
  const typing = e.target.closest && e.target.closest('input, select, textarea');
  if (String(S.drawer).startsWith('form:') && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); formStep(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (S.view !== 'rate' || S.rateMode !== 'duel' || S.drawer || typing || !S.loaded) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); duel('1'); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); duel('0'); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); duel('0.5'); }
  else if (e.key === ' ') { e.preventDefault(); duel('skip'); }
});

/* перетаскивание — только в плане (data-drop-date = дата, пусто = убрать). На конвейере карточку двигают кнопки решения (22.10.2026) */
document.addEventListener('dragstart', e => {
  const d = e.target.closest && e.target.closest('[data-drag]');
  if (!d) return;
  S.dragKey = d.dataset.drag;
  e.dataTransfer.setData('text/plain', S.dragKey);
  e.dataTransfer.effectAllowed = 'move';
  d.classList.add('dragging');
  tip.hidden = true;
});
document.addEventListener('dragend', () => {
  S.dragKey = null;
  $$('.dragging').forEach(x => x.classList.remove('dragging'));
  $$('.over').forEach(x => x.classList.remove('over'));
});
const dropTarget = e => e.target.closest && e.target.closest('[data-drop-date]');
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
  const iso = z.dataset.dropDate || null;
  if ((u.plan_date || null) === iso) return;
  save(u, { plan_date: iso }, { label: iso ? `${u.id} в плане на ${dShort(iso)}. Записано ${Store.label}` : `${u.id} убран из плана` });
});

/* свежие данные при возврате в окно: правки из Обсидиана и с других устройств */
window.addEventListener('focus', () => { if (S.loaded && !S.dragKey && Date.now() - S.lastLoad > (MODE === 'gh' ? 30000 : 4000)) load(); });

loadPrefs();
if (MODE === 'gh') GH.restore();
load();
