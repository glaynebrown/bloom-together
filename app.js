/* Bloom Together: screens and wiring. Data lives in store.js (or demo.js in
   sample mode); keeping the two players in step is sync.js. */

// Workout parts. The list is shared and editable in Settings (room.cats);
// these are the starting ones. The first part is the warm-up. A part with
// worth: 2 (Full body) stands in for two parts when Surprise us picks.
const DEFAULT_CATS = [
  { key: 'stretch', label: 'Warm-up & stretch', short: 'Stretch' },
  { key: 'arms', label: 'Arms', short: 'Arms' },
  { key: 'legs', label: 'Legs', short: 'Legs' },
  { key: 'abs', label: 'Abs', short: 'Abs' },
  { key: 'fullbody', label: 'Full body', short: 'Full body', worth: 2 },
];
const LOOKS = [
  { key: 'nook', name: 'Reading Nook', swatch: ['#F7E9D9', '#6F7862', '#A37C76'] },
  { key: 'garden', name: 'Garden', swatch: ['#E4D8C2', '#70744F', '#DA8C80'] },
  { key: 'rose', name: 'Rose', swatch: ['#F2E4DC', '#A9594D', '#C0C5AF'] },
  { key: 'coastal', name: 'Coastal', swatch: ['#EFE7D6', '#4F7389', '#93AEBF'] },
  { key: 'sage', name: 'Sage', swatch: ['#DDE0D2', '#5B6763', '#DA8C80'] },
  { key: 'evening', name: 'Evening', swatch: ['#4A2F29', '#C0C5AF', '#DA8C80'] },
  { key: 'mine', name: 'Start from scratch (1)', swatch: ['#F3F1ED', '#4A4A4A', '#B5B0A8'] },
  { key: 'mine2', name: 'Start from scratch (2)', swatch: ['#F3F1ED', '#4A4A4A', '#B5B0A8'] },
  { key: 'auto', name: 'Match my device', swatch: ['#E4D8C2', '#4A2F29', '#70744F'] },
];
const MINUTES = [0, 5, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60];
const DEFAULT_MIX = {
  stretch: { on: true, min: 0, max: 0 },
  arms: { on: true, min: 0, max: 0 },
  legs: { on: true, min: 0, max: 0 },
  abs: { on: false, min: 0, max: 0 },
};
const DEFAULT_GOAL = 3;

const A = {
  store: null,
  code: null,
  me: null,
  room: null,
  videos: [],
  live: null,
  workouts: [],
  presence: {},
  route: '',
  ui: { cat: 'all', len: 'any', q: '', sort: 'new', adding: false, importMsg: '', editing: null, mix: null, weekOffset: 0, big: false },
};

const $view = document.getElementById('view');
const $top = document.getElementById('top');
const $stage = document.getElementById('stage');
const $shield = document.getElementById('shield');

/* ---------- small helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const other = () => (A.me === 'p1' ? 'p2' : 'p1');
const nameOf = p => ((A.room && A.room.names) || {})[p] || (p === 'p1' ? 'Bella' : 'Izzy');
const settings = () => (A.room && A.room.settings) || {};
const queue = () => (A.live && A.live.queue) || [];
const isRunning = (s = A.live) => !!s && ['ready', 'playing', 'paused'].includes(s.mode);
const allCats = () => (A.room && A.room.cats && A.room.cats.length ? A.room.cats : DEFAULT_CATS);
const catOf = key => allCats().find(c => c.key === key);
// Parts used when building workouts. A part with use: false (like Cardio,
// for now) is just a label in the Library: Surprise, Mix and Pick skip it.
const buildCats = () => allCats().filter(c => c.use !== false);
// A video is only for building if at least one of its parts is (untagged videos count).
const buildable = v => !videoCats(v).length || videoCats(v).some(k => catOf(k).use !== false);
const partName = key => (catOf(key) || {}).short || '';
const videoCats = v => (v.cats || []).filter(k => catOf(k)); // ignores removed parts
// The Work Out tab shows the player while a workout is going (and until it's
// logged, plus the "Logged!" moment); otherwise it shows today's plan + builder.
const playerView = () => isRunning() || (!!A.live && A.live.mode === 'finished' && (!A.live.logged || A.ui.justLogged));
const online = p => !!A.presence[p] && A.store.now() - A.presence[p] < 50000;
const clock = sec => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const mins = sec => (sec ? `${Math.max(1, Math.round(sec / 60))} min` : '—');
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

// Who's using this device. In sample mode it's per tab, so two tabs can be the two sisters.
const sample = () => A.store && A.store.kind === 'sample';
const getMe = () => (sample() ? sessionStorage.getItem('bt-me') : lsGet('bt-me'));
const setMe = v => { if (sample()) { v == null ? sessionStorage.removeItem('bt-me') : sessionStorage.setItem('bt-me', v); } else lsSet('bt-me', v); };

// "Are you sure?" in the app's own style. (The browser's confirm() popup can't
// be styled, and some in-app browsers block it outright.) Resolves true/false.
function ask(message, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask';
    wrap.innerHTML = `<div class="ask-box" role="alertdialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="ask-btns"><button class="btn ghost" data-ans="0">Cancel</button><button class="btn primary ${danger ? 'danger-btn' : ''}" data-ans="1">${esc(okLabel)}</button></div>
    </div>`;
    const done = ans => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(ans); };
    const onKey = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-ans]');
      if (b) done(b.dataset.ans === '1');
      else if (e.target === wrap) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-ans="1"]').focus();
  });
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
window.App = { toast };

const ICONS = {
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  prev: '<path d="M6 5h2v14H6zM20 5v14L9.5 12z"/>',
  next: '<path d="M16 5h2v14h-2zM4 5v14l10.5-7z"/>',
  back15: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/><text x="12" y="15.5" font-size="6.5" text-anchor="middle" font-weight="700" font-family="DM Sans, sans-serif">15</text>',
  fwd15: '<path d="M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z"/><text x="12" y="15.5" font-size="6.5" text-anchor="middle" font-weight="700" font-family="DM Sans, sans-serif">15</text>',
  dice: '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
  reroll: '<path d="M17.6 6.4A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z"/>',
  up: '<path d="M12 6l6 7H6z"/>',
  down: '<path d="M12 18l-6-7h12z"/>',
  x: '<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>',
  expand: '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>',
  shrink: '<path d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  heart: '<path d="M12 20.5 10.6 19.2C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z"/>',
  heartOutline: '<path d="M16.5 2c-1.7 0-3.4.8-4.5 2.1C10.9 2.8 9.2 2 7.5 2 4.4 2 2 4.5 2 7.6c0 3.8 3.4 6.9 8.6 11.6l1.4 1.3 1.4-1.3C18.6 14.5 22 11.4 22 7.6 22 4.5 19.6 2 16.5 2zm-4.4 15.7-.1.1-.1-.1C7.1 13.4 4 10.6 4 7.6 4 5.6 5.5 4 7.5 4c1.5 0 3 1 3.6 2.4h1.9C13.5 5 15 4 16.5 4c2 0 3.5 1.6 3.5 3.6 0 3-3.1 5.8-7.9 10.1z"/>',
  dropper: '<path d="M19.4 4.6a2 2 0 0 0-2.8 0l-2.3 2.3-1.1-1.1-1.4 1.4 1.1 1.1-7.4 7.4V19h3.3l7.4-7.4 1.1 1.1 1.4-1.4-1.1-1.1 2.3-2.3a2 2 0 0 0 0-2.8zM7.6 17H7v-.6l7.1-7.1.6.6z"/>',
  edit: '<path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.3 1.3 2.8 2.8z"/>',
};
const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* A flower with one petal per workout in the weekly goal. Up to 3 petals fan
   out on top; more go all the way around (smaller, and raised above the leaves). */
function flower(filled, size = 120, label = '', goal = DEFAULT_GOAL) {
  const n = Math.max(1, goal);
  if (n <= 2) return rose(filled, size, label, n);
  const ring = n > 3;
  // With an even number around, turn half a step so the stem meets the head
  // between two petals (odd numbers already leave a gap at the bottom).
  const turn = ring && n % 2 === 0 ? 180 / n : 0;
  const angles = [...Array(n)].map((_, i) => (ring ? (360 / n) * i + turn : (i - (n - 1) / 2) * 64));
  const sx = ring ? (n <= 5 ? 0.8 : 0.66) : 1;   // slimmer petals when there are more
  const sy = ring ? 0.72 : 1;                    // shorter petals all the way around
  const lift = ring ? -14 : 0;                   // raise the head so petals clear the leaves
  const petals = angles.map((rot, i) => {
    const on = i < filled;
    return `<path d="M60 58 C44 46 44 22 60 12 C76 22 76 46 60 58Z" transform="rotate(${rot} 60 60) translate(60 60) scale(${sx} ${sy}) translate(-60 -60)" class="petal ${on ? 'on' : ''}" style="--d:${i * 0.12}s"/>`;
  }).join('');
  const full = filled >= n;
  return `<svg class="flower ${full ? 'full' : ''}" width="${size}" height="${size}" viewBox="0 0 120 130" role="img" aria-label="${esc(label || `${Math.min(filled, n)} of ${n} workouts`)}">
    <path d="M60 ${64 + lift} C60 90 58 105 60 128" class="stem"/>
    <path d="M60 104 C46 100 38 92 36 82 C48 84 56 92 60 104Z" class="leaf"/>
    <path d="M60 96 C72 92 80 84 83 74 C71 76 63 84 60 96Z" class="leaf"/>
    <g transform="translate(0 ${lift})">
      ${full && !ring ? [-122, 122].map(r => `<path d="M60 58 C48 48 48 30 60 22 C72 30 72 48 60 58Z" transform="rotate(${r} 60 60)" class="petal back"/>`).join('') : ''}
      ${petals}
      <circle cx="60" cy="${ring ? 60 : 58}" r="${ring ? 7 : 8}" class="heart ${full ? 'on' : ''}"/>
    </g>
  </svg>`;
}

/* For a goal of 1 or 2: roses. A goal of 1 is one rose that fills in; a goal
   of 2 is two smaller buds on one stem, staggered, filling one per workout
   (the higher bud first). */
const ROSE_HEAD = 'M60 5 C52 1 44 3 40 8 C34 6 28 10 27 16 C20 18 16 24 19 30 C13 34 14 42 20 47 C27 53 37 55 46 55 C52 57 56 58 60 58 C66 58 73 57 79 55 C89 52 98 46 100 38 C102 30 98 22 92 20 C92 13 86 8 80 8 C76 3 68 1 60 5Z';
const ROSE_LINES = `
  <path d="M40 12 C47 7 58 7 66 10 C75 8 83 13 84 21"/>
  <path d="M40 12 C35 19 34 28 38 36"/>
  <path d="M50 17 C56 12 66 13 68 20 C70 27 62 31 56 28 C51 26 52 20 57 19 C61 18 63 22 61 24"/>
  <path d="M38 36 C44 46 56 50 70 48 C79 46 85 42 88 36"/>
  <path d="M44 44 C52 37 64 33 80 33"/>
  <path d="M54 51 C63 46 74 44 88 44"/>
  <path d="M21 30 C28 30 32 34 34 40"/>
  <path d="M99 31 C93 30 89 32 86 36"/>
  <path d="M27 16 C31 20 34 24 35 28"/>
  <path d="M92 20 C88 22 86 25 85 28"/>`;
// One bloom whose base sits at (x, y), scaled by k. Its own shape is a bit taller than wide.
function roseHead(x, y, k, on) {
  return `<g transform="translate(${x} ${y}) scale(${k}) translate(-60 -61.4) translate(60 30) scale(0.95 1.12) translate(-60 -30)">
    <path d="${ROSE_HEAD}" class="petal ${on ? 'on' : ''}"/>
    <g class="rose-lines ${on ? 'on' : ''}">${ROSE_LINES}</g>
  </g>`;
}
// Little leaves cupping the base of a bloom at (x, y).
const sepals = (x, y, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="M-2 0 C6 -3 16 -2 24 4 C16 5 8 4 0 3Z M2 0 C-6 -3 -16 -2 -20 3 C-13 4 -6 3 0 3Z" class="leaf"/>`;

function rose(filled, size, label, n) {
  const full = filled >= n;
  const open = `<svg class="flower rose ${full ? 'full' : ''}" width="${size}" height="${size}" viewBox="0 0 120 130" role="img" aria-label="${esc(label || `${Math.min(filled, n)} of ${n} workout${n === 1 ? '' : 's'}`)}">`;
  if (n === 1) {
    return `${open}
    <path d="M60 60 C61 80 58 100 59 128" class="stem thick"/>
    <path d="M60 75 L65 71 L61 79Z M59 101 L54 98 L58 106Z" class="leaf"/>
    <path d="M59 110 C54 104 48 99 42 96" class="stem"/><path d="M59 116 C65 108 71 102 78 98" class="stem"/>
    <path d="M43 96 C30 97 18 88 12 70 C17 72 22 71 26 73 C33 76 40 83 43 96Z" class="leaf"/>
    <path d="M77 98 C90 99 102 90 108 72 C103 74 98 73 94 75 C87 78 80 85 77 98Z" class="leaf"/>
    <path d="M41 93 C33 88 24 80 18 74 M79 95 C87 90 96 82 102 76" class="leaf-vein"/>
    ${sepals(60, 60)}
    ${roseHead(60, 61.4, 1, full)}
  </svg>`;
  }
  // Two buds: the higher one on the main stem, the lower one on a branch.
  return `${open}
    <path d="M59 128 C58 108 56 84 50 66 C48 60 46 56 44 52" class="stem thick"/>
    <path d="M56 100 C64 95 76 90 84 82" class="stem"/>
    <path d="M52 76 L47 73 L51 81Z M58 112 L63 109 L59 117Z" class="leaf"/>
    <path d="M58 118 C52 112 46 108 40 106" class="stem"/>
    <path d="M41 106 C29 106 19 98 14 84 C18 86 22 85 26 87 C32 90 38 96 41 106Z" class="leaf"/>
    <path d="M39 103 C32 99 25 93 20 88" class="leaf-vein"/>
    <path d="M59 123 C64 120 70 119 75 118" class="stem"/>
    <path d="M74 118 C84 119 93 114 98 105 C94 106 90 106 87 107 C81 109 76 113 74 118Z" class="leaf"/>
    <path d="M76 116 C82 113 88 110 93 107" class="leaf-vein"/>
    ${sepals(84, 82, 0.7)}
    ${roseHead(84, 83, 0.56, filled >= 2)}
    ${sepals(44, 52, 0.7)}
    ${roseHead(44, 53, 0.56, filled >= 1)}
  </svg>`;
}

/* ---------- workouts, weeks, streak ---------- */
function weekDays(week) {
  const days = new Set();
  A.workouts.forEach(w => { if (Dates.weekOf(w.day) === week) days.add(w.day); });
  return days;
}
const planKey = week => `w${week.replace(/-/g, '')}`;
// The weekly goal can change (room.goals: { wYYYYMMDD: n }, from that week on),
// so past weeks keep the goal they had at the time.
function goalFor(week) {
  const goals = (A.room && A.room.goals) || {};
  const k = planKey(week);
  const past = Object.keys(goals).filter(g => g <= k).sort();
  return past.length ? goals[past[past.length - 1]] : DEFAULT_GOAL;
}
function streakInfo() {
  const thisW = Dates.thisWeek();
  const count = weekDays(thisW).size;
  const goal = goalFor(thisW);
  let streak = 0;
  let w = count >= goal ? thisW : Dates.addDays(thisW, -7);
  while (weekDays(w).size >= goalFor(w)) { streak++; w = Dates.addDays(w, -7); }
  return { count, streak, goal };
}
const planFor = week => ((A.room && A.room.plans) || {})[planKey(week)] || [];
function lastDone(vid) {
  let best = null;
  A.workouts.forEach(w => (w.videos || []).forEach(v => { if (v.vid === vid && (!best || w.day > best)) best = w.day; }));
  return best;
}
const recentWorkouts = () => A.workouts.slice().sort((a, b) => (b.day + b.t).localeCompare(a.day + a.t));

/* ---------- picking videos ---------- */
function fits(v, min, max) {
  if (!min && !max) return true;
  if (!v.seconds) return false;
  const m = v.seconds / 60;
  return (!min || m >= min - 0.5) && (!max || m <= max + 0.5);
}
function recentVids() {
  const ids = new Set();
  recentWorkouts().slice(0, 2).forEach(w => (w.videos || []).forEach(v => ids.add(v.vid)));
  return ids;
}
// A random video for a slot, preferring ones you haven't done lately.
function pick(slot, min, max, exclude = new Set()) {
  const pool = A.videos.filter(v => !v.noEmbed && (v.cats || []).includes(slot) && fits(v, min, max) && !exclude.has(v.id));
  // (slot is always a workout part here, so library-only parts never get picked)
  const recent = recentVids();
  const fresh = pool.filter(v => !recent.has(v.id));
  const from = fresh.length ? fresh : pool;
  return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}
const toItem = (v, slot, min = 0, max = 0) => ({
  vid: v.id, yt: v.yt, title: v.title || '', seconds: v.seconds || 0, cats: v.cats || [],
  slot: slot || (v.cats || [])[0] || null, min: min || 0, max: max || 0,
});

// Change today's queue. While a workout is running, only what's after the
// current video can change; otherwise this also resets it to "not started".
function editQueue(fn) {
  return A.store.changeLive(c => {
    const q = (c.queue || []).slice();
    const running = isRunning(c);
    if (fn(q, running ? c.index : -1) === false) return null;
    const patch = { queue: q };
    if (!running) Object.assign(patch, { mode: 'idle', index: 0, position: 0, logged: false, rest: false, startAt: 0 });
    return patch;
  }).catch(e => { console.error(e); toast('Couldn’t update the workout'); });
}

// The first part (the warm-up), then two parts' worth: either two random
// parts, or one "counts as 2" part like Full body. Every option is equally likely.
function surprise() {
  const [warm, ...rest] = buildCats();
  const avail = rest.filter(c => pick(c.key));
  const singles = avail.filter(c => (c.worth || 1) < 2);
  const options = avail.filter(c => (c.worth || 1) >= 2).map(c => [c.key]);
  for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) options.push(shuffle([singles[i].key, singles[j].key]));
  if (!options.length && singles.length) options.push([singles[0].key]);
  const main = options.length ? options[Math.floor(Math.random() * options.length)] : [];
  const slots = [...(warm && pick(warm.key) ? [warm.key] : []), ...main];
  const used = new Set();
  const q = slots.map(s => { const v = pick(s, 0, 0, used); used.add(v.id); return toItem(v, s); });
  if (!q.length) return toast('Add some videos to the library first');
  editQueue(qq => { qq.splice(0, qq.length, ...q); });
  A.ui.builderOpen = false;
  toast('🎲 Surprise workout ready');
}
function buildMix(mix) {
  const used = new Set();
  const q = [], missing = [];
  buildCats().forEach(c => {
    const m = mix[c.key];
    if (!m || !m.on) return;
    const v = pick(c.key, m.min, m.max, used);
    if (v) { used.add(v.id); q.push(toItem(v, c.key, m.min, m.max)); } else missing.push(c.short);
  });
  if (!q.length) return toast('Nothing matches — try wider lengths');
  editQueue(qq => { qq.splice(0, qq.length, ...q); });
  A.ui.builderOpen = false;
  toast(missing.length ? `No ${missing.join(' or ')} video fits those lengths` : 'Workout ready');
}
function reroll(i) {
  editQueue((q, cur) => {
    if (i <= cur) return false;
    const it = q[i];
    const v = pick(it.slot, it.min, it.max, new Set(q.map(x => x.vid)));
    if (!v) { toast(`No other ${partName(it.slot).toLowerCase()} videos fit`); return false; }
    q[i] = toItem(v, it.slot, it.min, it.max);
  });
}
function addToQueue(v) {
  const wasEmpty = !queue().length;
  editQueue(q => { q.push(toItem(v)); });
  toast(wasEmpty ? 'Added to today’s workout' : 'Added');
}

/* ---------- boot ---------- */
function boot() {
  applyCustom();
  A.store = Store.configured ? Store : DemoStore;
  if (A.store.kind === 'sample') {
    const b = document.getElementById('banner');
    b.hidden = false;
    b.textContent = 'Sample mode · saved in this browser only · open a second tab as the other sister to try syncing';
  }
  A.code = lsGet('bt-room');
  A.me = getMe();
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(render, 0); });
  const msg = sessionStorage.getItem('bt-join-msg');
  sessionStorage.removeItem('bt-join-msg');
  if (!A.code) return renderJoin(msg || '');
  const note = sessionStorage.getItem('bt-toast');
  if (note) { sessionStorage.removeItem('bt-toast'); setTimeout(() => toast(note), 800); }
  // Make sure this device is signed in before listening (offline, go ahead anyway).
  A.store.ready().catch(() => {}).then(openRoom);
}

function openRoom() {
  A.store.open(A.code);
  let first = true;
  A.store.watchRoom(r => {
    if (!r) {
      if (A.moving) return; // this device is changing the code itself
      // Nothing under this code (anymore): sign this device out.
      if (!first) {
        // Another tab in this same browser may have just moved us to a new
        // code; if so, simply follow it. Otherwise sign out.
        if (lsGet('bt-room') === A.code) {
          sessionStorage.setItem('bt-join-msg', 'Our code was changed on another device. Sign in with the new one.');
          lsSet('bt-room', null);
        }
        return location.reload();
      }
      if (A.store.kind === 'sample') { lsSet('bt-room', null); return renderJoin(); }
      return;
    }
    A.room = r;
    if (first) { first = false; addNewDefaults(r); startRoom(); }
    render();
  });
}

// Parts added to the app after your code was created (like Full body) are
// offered once: added to your list, and matching videos tagged from their
// titles. If you remove one later it stays removed.
function addNewDefaults(r) {
  if (!r.cats) return; // still on the built-in list, which already has everything
  const offered = new Set(r.defaultsOffered || r.cats.map(c => c.key));
  const fresh = DEFAULT_CATS.filter(d => !offered.has(d.key) && !r.cats.some(c => c.key === d.key));
  if (!fresh.length && r.defaultsOffered) return;
  A.store.updateRoom({
    cats: [...r.cats, ...fresh],
    defaultsOffered: [...new Set([...offered, ...DEFAULT_CATS.map(d => d.key)])],
  });
  if (fresh.length) A.pendingTag = fresh; // tagged once the library loads (startRoom)
}
function tagPending(videos) {
  if (!A.pendingTag || !videos.length) return;
  const fresh = A.pendingTag;
  A.pendingTag = null;
  videos.forEach(v => {
    const add = YT_.guessCats(v.title, fresh).filter(k => !(v.cats || []).includes(k));
    if (add.length) A.store.updateVideo(v.id, { cats: [...(v.cats || []), ...add] });
  });
}

function startRoom() {
  if (!A.me) return renderWho();
  A.store.watchVideos(v => { A.videos = v; tagPending(v); render(); });
  A.store.watchWorkouts(w => { A.workouts = w; render(); });
  A.store.watchPresence(p => { A.presence = p; renderTop(); });
  A.store.watchLive(onLive);
  Sync.init({ store: A.store, me: A.me, getSettings: settings, onChange: onSyncChange });
  const beat = () => A.store.heartbeat(A.me, nameOf(A.me));
  beat();
  setInterval(beat, 20000);
  A.store.calibrate(A.me);
  setInterval(() => A.store.calibrate(A.me), 10 * 60000);
  setInterval(tick, 250);
  setInterval(renderTop, 15000);
  route();
}

let lastRev = null;
let lastRevSeeded = false;
function onLive(s) {
  const prev = A.live;
  A.live = s;
  Sync.apply(s);
  // Let you know what your sister just did.
  if (s && lastRev !== null && s.rev !== lastRev && s.by && s.by !== A.me) {
    const who = nameOf(s.by);
    const msg = {
      start: `${who} lined up the workout`, play: `${who} pressed play`, pause: `${who} paused`,
      seek: `${who} skipped around`, go: `${who} switched videos`, skip: `${who} skipped the rest`,
      rest: `${who} added rest time`, end: `${who} ended the workout`,
    }[s.action];
    if (msg) toast(msg);
  }
  if (s) lastRev = s.rev;
  // Hop to the workout when it starts (from either side).
  if (s && s.action === 'start' && (!prev || prev.rev !== s.rev) && A.route !== 'workout' && lastRevSeeded) location.hash = '#/workout';
  lastRevSeeded = true;
  render();
}

function route() {
  A.route = location.hash.replace(/^#\/?/, '');
  if (A.route === 'build') { location.replace('#/workout'); return; } // old link
  if (A.route !== 'workout') A.ui.justLogged = false;
  if (A.route !== 'workout') setBig(false);
  window.scrollTo(0, 0);
  render(true);
}

/* ---------- rendering ---------- */
let pendingRender = false;
function render(force) {
  if (!A.room || !A.me) return;
  // Don't redraw under someone typing.
  const f = document.activeElement;
  if (!force && f && $view.contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName) && f.type !== 'checkbox' && f.type !== 'button') {
    pendingRender = true;
    return;
  }
  pendingRender = false;
  renderTop();
  const screens = { '': renderHome, library: renderLibrary, workout: renderWorkout, settings: renderSettings };
  const oldPlots = $view.querySelector('.plots');
  const plotsScroll = oldPlots ? oldPlots.scrollLeft : null;
  $view.innerHTML = (screens[A.route] || renderHome)();
  centerGarden(plotsScroll);
  fitHello();
  layoutStage();
  tick();
}

// Keep the greeting and date on one row: shorten the month ("Sept") if the
// full name doesn't fit, and only if that still doesn't fit, shrink the text.
function fitHello() {
  const row = $view.querySelector('.hello');
  if (!row) return;
  const date = row.querySelector('.hello-date');
  row.classList.remove('tight', 'tighter');
  date.textContent = date.dataset.long;
  const overflows = () => row.scrollWidth > row.clientWidth + 1;
  if (overflows()) date.textContent = date.dataset.short;
  if (overflows()) row.classList.add('tight');
  if (overflows()) row.classList.add('tighter');
}
if (document.fonts) document.fonts.ready.then(() => fitHello());

// On small screens the garden row scrolls: start with this week in the middle,
// and keep wherever you scrolled it when the screen redraws.
function centerGarden(keep) {
  const row = $view.querySelector('.plots');
  if (!row) return;
  const center = () => {
    const now = row.querySelector('.plot.now');
    if (now) row.scrollLeft = now.offsetLeft - row.offsetLeft - (row.clientWidth - now.offsetWidth) / 2;
  };
  if (keep != null) { row.scrollLeft = keep; return; }
  center();
  requestAnimationFrame(center);
  if (document.fonts) document.fonts.ready.then(center);
}

function renderTop() {
  if (!A.room || !A.me) return;
  $top.hidden = false;
  const tab = (r, label) => `<a href="#/${r}" class="${A.route === r ? 'on' : ''}">${label}</a>`;
  const person = p => `<span class="person ${p} ${online(p) ? 'online' : ''}" title="${online(p) ? 'Here now' : 'Not here right now'}"><i></i>${esc(nameOf(p))}</span>`;
  $top.innerHTML = `
    <a class="brand ${A.route === '' ? 'on' : ''}" href="#/" title="Home" aria-label="Home">${flower(1, 34, 'Home', 1)}</a>
    <nav>${tab('workout', 'Work Out')}${tab('library', 'Library')}${tab('settings', 'Settings')}</nav>
    <div class="people">${person('p1')}<span class="amp">&amp;</span>${person('p2')}</div>`;
  // Names stay side by side unless the row truly doesn't fit.
  $top.classList.remove('tight');
  const nav = $top.querySelector('nav');
  if ($top.scrollWidth > $top.clientWidth + 1 || nav.scrollWidth > nav.clientWidth + 1) $top.classList.add('tight');
}
window.addEventListener('resize', () => { renderTop(); fitHello(); });

function layoutStage() {
  const onWorkout = A.route === 'workout' && playerView();
  const mini = !onWorkout && isRunning();
  document.body.classList.toggle('route-workout', onWorkout);
  $stage.classList.toggle('on', onWorkout);
  $stage.classList.toggle('mini', mini);
  $stage.classList.toggle('off', !onWorkout && !mini);
  renderShield();
}

function renderShield() {
  const st = Sync.status();
  const visible = A.route === 'workout' || isRunning();
  let html = '';
  if (visible && isRunning() && !st.primed) html = `<button class="tap-in" data-act="tap-in">${flower(1, 44, '', 1)}<span>Tap to join in</span><small>Lets this device play the video</small></button>`;
  else if (visible && st.needTap) html = `<button class="tap-in" data-act="tap-in"><span>Tap to catch up</span><small>The browser needs a tap to start the video</small></button>`;
  if ($shield.dataset.html !== html) { $shield.innerHTML = html; $shield.dataset.html = html; }
  $shield.classList.toggle('active', !!html);
}

// Four times a second: the parts of the workout screen that move.
function tick() {
  renderShield();
  if (A.route !== 'workout') return;
  const st = Sync.status();
  const set = (sel, fn) => $view.querySelectorAll(sel).forEach(fn);
  set('[data-tick=time]', el => { el.textContent = `${clock(st.pos)} / ${clock(st.dur)}`; });
  set('[data-tick=left]', el => { el.textContent = st.dur ? `-${clock(st.dur - st.pos)}` : ''; });
  set('[data-tick=bar]', el => { el.style.width = st.dur ? `${Math.min(100, (st.pos / st.dur) * 100)}%` : '0%'; });
  set('[data-tick=count]', el => {
    const show = st.mode === 'playing' && st.countdown > 0.05;
    el.hidden = !show;
    const n = el.querySelector('b');
    if (show && n) n.textContent = st.countdown > 10 ? clock(Math.ceil(st.countdown)) : String(Math.ceil(st.countdown));
  });
}

// The player changed state (started, buffering, blocked...).
const onSyncChange = () => renderShield();

/* ---------- join / who ---------- */
const WORDS = ['peony', 'sage', 'rose', 'olive', 'fern', 'lilac', 'poppy', 'willow', 'dahlia', 'clover', 'iris', 'maple', 'tulip', 'hazel', 'juniper', 'marigold'];
const suggestCode = () => `bloom-${shuffle(WORDS).slice(0, 2).join('-')}-${Math.floor(10 + Math.random() * 90)}`;

// Signing in is what everyone does after day one, so it's the main thing here.
// Starting a new code (a fresh, empty space) sits behind a small link.
function renderJoin(err = '', creating = false) {
  $top.hidden = true;
  const last = lsGet('bt-last-code') || '';
  const signIn = `
        <form class="card" data-form="join">
          <h2>Sign in with our code</h2>
          <label>Our code<input name="code" value="${esc(last)}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>
          ${err ? `<p class="err">${esc(err)}</p>` : ''}
          <button class="btn primary">Sign in</button>
        </form>
        <p class="join-alt">First time? <button class="link" data-act="join-create">Start a new code</button></p>`;
  const create = `
        <form class="card" data-form="create">
          <h2>Start a new code</h2>
          <p class="muted">Do this once, on one device. It’s your shared login: send it to your sister.</p>
          <label>Our code<input name="code" value="${suggestCode()}" autocomplete="off" autocapitalize="none" spellcheck="false" required minlength="8"></label>
          <div class="two">
            <label>Your name<input name="n1" value="Bella" required></label>
            <label>Sister’s name<input name="n2" value="Izzy" required></label>
          </div>
          <button class="btn primary">Create our code</button>
        </form>
        <p class="join-alt">Already have one? <button class="link" data-act="join-signin">Sign in instead</button></p>`;
  $view.innerHTML = `
    <section class="join">
      ${flower(1, 110, 'Bloom Together', 1)}
      <h1>Bloom Together</h1>
      <p class="lede">Bella &amp; Izzy’s workouts, in sync.</p>
      <div class="join-one">${creating ? create : signIn}</div>
    </section>`;
}

function renderWho() {
  $top.hidden = true;
  $view.innerHTML = `
    <section class="join">
      ${flower(1, 90, 'Bloom Together', 1)}
      <h1>Who’s this?</h1>
      <p class="lede">This device will remember, so it always says hi to the right sister.</p>
      <div class="who">
        <button class="who-btn p1" data-act="be" data-p="p1">${esc(nameOf('p1'))}</button>
        <button class="who-btn p2" data-act="be" data-p="p2">${esc(nameOf('p2'))}</button>
      </div>
    </section>`;
}

/* ---------- home ---------- */
function renderHome() {
  const { count, streak } = streakInfo();
  const me = nameOf(A.me);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Hi' : 'Good evening';
  const liveBanner = isRunning()
    ? `<a class="live-banner" href="#/workout"><span class="pulse"></span><span><b>Workout in progress</b> · video ${A.live.index + 1} of ${queue().length}</span><span class="go">Join ›</span></a>`
    : A.live && A.live.mode === 'finished' && !A.live.logged
      ? `<a class="live-banner done" href="#/workout"><span><b>You finished!</b> Tap to log it</span><span class="go">Log it ›</span></a>` : '';
  return `
    <section class="hello">
      <h1>${hello}, ${esc(me)}</h1>
      <p class="hello-date" data-long="${esc(Dates.niceLong(Dates.today()))}" data-short="${esc(Dates.niceMid(Dates.today()))}">${Dates.niceLong(Dates.today())}</p>
    </section>
    ${liveBanner || todayStrip()}
    <div class="home-grid">
      ${weekCard(count, streak)}
      ${gardenCard()}
    </div>`;
}

function weekCard(count, streak) {
  const week = Dates.addDays(Dates.thisWeek(), A.ui.weekOffset * 7);
  const plan = planFor(week);
  const done = weekDays(week);
  const today = Dates.today();
  const weekCount = done.size;
  const days = Dates.SHORT.map((d, i) => {
    const day = Dates.addDays(week, i);
    const cls = [plan.includes(i) ? 'planned' : '', done.has(day) ? 'done' : '', day === today ? 'today' : '', day < today ? 'past' : ''].join(' ');
    return `<button class="day ${cls}" data-act="plan" data-i="${i}" data-week="${week}" aria-pressed="${plan.includes(i)}">
      <span class="dname">${d}</span><span class="dnum">${Number(day.slice(8))}</span><span class="dmark">${done.has(day) ? '✿' : ''}</span></button>`;
  }).join('');
  const label = A.ui.weekOffset === 0 ? 'This week' : A.ui.weekOffset === 1 ? 'Next week' : A.ui.weekOffset === -1 ? 'Last week' : `Week of ${Dates.monthDay(week)}`;
  const shown = A.ui.weekOffset === 0 ? count : weekCount;
  const goal = goalFor(week);
  const when = A.ui.weekOffset === 0 ? 'this week' : A.ui.weekOffset === 1 ? 'next week' : 'that week';
  const msg = shown >= goal ? 'Full bloom!' : A.ui.weekOffset >= 0 ? `${goal - shown} more to bloom ${when}` : '';
  return `
    <section class="card week">
      <div class="week-top">
        <div class="bloom">${flower(Math.min(shown, goal), 108, '', goal)}${shown > goal ? `<span class="extra">+${shown - goal}</span>` : ''}</div>
        <div>
          <p class="eyebrow">${label}</p>
          <p class="big-num">${shown} <span>of ${goal}</span></p>
          <p class="muted">${msg}</p>
          <p class="streak">${streak ? `<b>${streak}</b>-week streak` : 'Start your streak this week'}</p>
        </div>
      </div>
      <div class="week-nav">
        <button class="icon-btn" data-act="week" data-d="-1" aria-label="Previous week">‹</button>
        <p class="muted small">Tap the days you’re planning to work out</p>
        <button class="icon-btn" data-act="week" data-d="1" aria-label="Next week">›</button>
      </div>
      <div class="days">${days}</div>
      ${settings().solo ? `<button class="btn ghost small" data-act="solo">Log a solo workout today</button>` : ''}
    </section>`;
}

// Home's one-line rundown of today's workout, with a button to start it.
function todayStrip() {
  const q = queue();
  const doneToday = A.live && A.live.mode === 'finished' && A.live.logged;
  if (!q.length || doneToday) {
    return `<a class="today-strip quiet" href="#/workout"><span><b>Today’s workout</b> · ${doneToday ? 'nice work! Line up the next one anytime' : 'nothing lined up yet'}</span><span class="go">Plan it ›</span></a>`;
  }
  const parts = q.map(x => partName(x.slot) || 'Video').join(', ');
  return `<div class="today-strip">
    <a href="#/workout" class="today-info"><b>Today’s workout</b><span class="muted">${esc(parts)} · ${q.length} video${q.length === 1 ? '' : 's'} · about ${mins(q.reduce((t, x) => t + (x.seconds || 0), 0))}</span></a>
    <button class="btn primary" data-act="start">${icon('play')} Let’s go</button>
  </div>`;
}

function queueCard() {
  const q = queue();
  const finishedLogged = A.live && A.live.mode === 'finished' && A.live.logged;
  if (!q.length || finishedLogged) {
    return `
      <section class="card today-card">
        <h2>Today’s workout</h2>
        <p class="muted">${finishedLogged ? 'Nice work today! Line up the next one below whenever you’re ready.' : 'Nothing lined up yet. Build one below.'}</p>
      </section>`;
  }
  return `
    <section class="card today-card">
      <div class="row-between"><h2>Today’s workout</h2><span class="row">${favButton(q)}<button class="link" data-act="clear">Clear</button></span></div>
      ${queueList()}
      <div class="row-between">
        <span class="muted">${q.length} video${q.length === 1 ? '' : 's'} · about ${mins(q.reduce((s, x) => s + (x.seconds || 0), 0))}</span>
        <button class="btn primary" data-act="start">${icon('play')} Start workout</button>
      </div>
    </section>`;
}

function queueList(opts = {}) {
  const q = queue();
  const cur = isRunning() ? A.live.index : -1;
  return `<ol class="queue ${opts.compact ? 'compact' : ''}">${q.map((it, i) => {
    const locked = i <= cur;
    const tag = partName(it.slot);
    return `<li class="${i === cur ? 'current' : ''} ${i < cur ? 'past' : ''}">
      <img src="${YT_.thumb(it.yt)}" alt="" loading="lazy">
      <div class="q-text"><span class="q-tag">${esc(tag)}</span><span class="q-title">${esc(it.title)}</span><span class="muted small">${mins(it.seconds)}</span></div>
      <div class="q-actions">
        ${opts.jump && i !== cur ? `<button class="icon-btn" data-act="go" data-i="${i}" title="Play this one">${icon('play')}</button>` : ''}
        ${!locked && it.slot ? `<button class="icon-btn" data-act="reroll" data-i="${i}" title="Swap for another">${icon('reroll')}</button>` : ''}
        ${!locked && !opts.compact ? `<button class="icon-btn" data-act="move" data-i="${i}" data-d="-1" title="Move up" ${i - 1 <= cur ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-act="move" data-i="${i}" data-d="1" title="Move down" ${i === q.length - 1 ? 'disabled' : ''}>${icon('down')}</button>` : ''}
        ${!locked ? `<button class="icon-btn" data-act="remove" data-i="${i}" title="Remove">${icon('x')}</button>` : ''}
      </div></li>`;
  }).join('')}</ol>`;
}

function gardenCard() {
  const weeks = [];
  // This week in the middle: 4 weeks back, then 4 still to come.
  const thisW = Dates.thisWeek();
  for (let i = -4; i <= 4; i++) weeks.push(Dates.addDays(thisW, 7 * i));
  const garden = weeks.map(w => {
    const n = weekDays(w).size;
    const { month, n: wk } = Dates.monthWeek(w);
    const when = w === thisW ? 'now' : w > thisW ? 'later' : '';
    return `<div class="plot ${when}" title="Week of ${Dates.monthDay(w)}: ${n} workout${n === 1 ? '' : 's'}">${flower(Math.min(n, goalFor(w)), 46, '', goalFor(w))}<b>${month}</b><span>Week ${wk}</span></div>`;
  }).join('');
  const recent = recentWorkouts().slice(0, 4).map(w => `
    <li><b>${Dates.nice(w.day)}</b><span class="muted">${w.solo ? `Solo · ${esc(nameOf(w.by))}` : w.videos && w.videos.length ? esc(w.videos.map(v => partName(v.slot) || 'Video').join(', ')) + ` · ${mins(w.seconds)}` : 'Workout'}</span></li>`).join('');
  return `
    <section class="card garden">
      <h2>Our garden</h2>
      <p class="muted small">Every week you hit ${goalFor(Dates.thisWeek())}, a flower blooms.</p>
      <div class="plots">${garden}</div>
      ${recent ? `<ul class="recent">${recent}</ul>` : ''}
    </section>`;
}

/* ---------- library ---------- */
function renderLibrary() {
  const u = A.ui;
  const untagged = A.videos.filter(v => !videoCats(v).length).length;
  let list = A.videos.filter(v => {
    if (u.cat === 'none') return !videoCats(v).length;
    if (u.cat !== 'all' && !(v.cats || []).includes(u.cat)) return false;
    const m = (v.seconds || 0) / 60;
    if (u.len === 'short' && !(v.seconds && m <= 10.5)) return false;
    if (u.len === 'mid' && !(m > 10.5 && m <= 20.5)) return false;
    if (u.len === 'long' && !(m > 20.5)) return false;
    if (u.q && !(v.title || '').toLowerCase().includes(u.q.toLowerCase())) return false;
    if (u.favOnly && !v.fav) return false;
    return true;
  });
  const sorts = {
    new: (a, b) => (b.t || 0) - (a.t || 0),
    short: (a, b) => (a.seconds || 0) - (b.seconds || 0),
    long: (a, b) => (b.seconds || 0) - (a.seconds || 0),
    stale: (a, b) => (lastDone(a.id) || '').localeCompare(lastDone(b.id) || ''),
  };
  list.sort(sorts[u.sort] || sorts.new);
  const chip = (key, label, n) => `<button class="chip ${u.cat === key ? 'on' : ''}" data-act="cat" data-c="${key}">${label}${n != null ? ` <span>${n}</span>` : ''}</button>`;
  const count = k => A.videos.filter(v => (v.cats || []).includes(k)).length;
  const inQueue = new Set(queue().map(x => x.vid));
  return `
    <section class="lib-head">
      <div><h1>Library</h1><p class="muted">${A.videos.length} video${A.videos.length === 1 ? '' : 's'}</p></div>
      <button class="btn primary" data-act="toggle-add">${icon('plus')} Add videos</button>
    </section>
    ${u.adding || !A.videos.length ? `
      <form class="card add-box" data-form="add">
        <h2>Add videos</h2>
        <p class="muted">Paste a link to a YouTube <b>playlist</b> (public or unlisted) to bring in every video, or a link to one video.</p>
        <div class="add-row"><input name="link" placeholder="https://www.youtube.com/playlist?list=…" autocomplete="off" required><button class="btn primary">Add</button></div>
        ${u.importMsg ? `<p class="import-msg">${esc(u.importMsg)}</p>` : ''}
      </form>` : ''}
    <div class="filters">
      <div class="chips">${chip('all', 'All', A.videos.length)}${allCats().map(c => chip(c.key, c.use === false ? `${esc(c.short)} <em>library</em>` : esc(c.short), count(c.key))).join('')}${untagged ? chip('none', 'Needs a category', untagged) : ''}</div>
      <div class="filter-row">
        <input type="search" data-bind="q" value="${esc(u.q)}" placeholder="Search titles">
        ${favFilter(u.favOnly, 'lib-fav')}
        <select data-bind="len" aria-label="Length">
          <option value="any" ${u.len === 'any' ? 'selected' : ''}>Any length</option>
          <option value="short" ${u.len === 'short' ? 'selected' : ''}>10 min or less</option>
          <option value="mid" ${u.len === 'mid' ? 'selected' : ''}>11–20 min</option>
          <option value="long" ${u.len === 'long' ? 'selected' : ''}>Over 20 min</option>
        </select>
        <select data-bind="sort" aria-label="Sort">
          <option value="new" ${u.sort === 'new' ? 'selected' : ''}>Newest added</option>
          <option value="short" ${u.sort === 'short' ? 'selected' : ''}>Shortest</option>
          <option value="long" ${u.sort === 'long' ? 'selected' : ''}>Longest</option>
          <option value="stale" ${u.sort === 'stale' ? 'selected' : ''}>Not done in a while</option>
        </select>
      </div>
    </div>
    ${u.cat === 'none' ? `<p class="hint">Tap the categories on each video to sort them. They’ll leave this list once they have one.</p>` : ''}
    <div class="vgrid">${list.map(v => videoCard(v, inQueue.has(v.id))).join('') || `<p class="muted empty">${!A.videos.length ? 'No videos yet — paste your playlist link above.' : u.favOnly && !A.videos.some(v => v.fav) ? 'No favorite videos yet. Tap the ♡ on a video to add it here.' : 'No videos match.'}</p>`}</div>`;
}

function videoCard(v, queued) {
  const done = lastDone(v.id);
  if (A.ui.editing === v.id) {
    return `<form class="vcard editing" data-form="edit" data-id="${v.id}">
      <img src="${YT_.thumb(v.yt)}" alt="" loading="lazy">
      <label>Title<input name="title" value="${esc(v.title)}"></label>
      <label>Length (minutes)<input name="mins" type="number" min="1" max="180" value="${v.seconds ? Math.round(v.seconds / 60) : ''}"></label>
      <div class="row-between"><button type="button" class="link danger" data-act="del-video" data-id="${v.id}">Delete</button>
      <span><button type="button" class="btn ghost small" data-act="edit" data-id="">Cancel</button> <button class="btn primary small">Save</button></span></div>
    </form>`;
  }
  return `<article class="vcard ${v.noEmbed ? 'blocked' : ''}">
    <div class="thumb"><img src="${YT_.thumb(v.yt)}" alt="" loading="lazy"><span class="len">${v.seconds ? clock(v.seconds) : '?'}</span></div>
    <h3>${esc(v.title)}</h3>
    ${v.noEmbed ? `<p class="err small">This video can’t play inside other apps (the creator turned that off).</p>` : ''}
    <div class="tag-toggles">${allCats().map(c => `<button class="tag ${(v.cats || []).includes(c.key) ? 'on' : ''}" data-act="tag" data-id="${v.id}" data-c="${c.key}">${c.short}</button>`).join('')}</div>
    <div class="row-between vfoot">
      <span class="muted small">${done ? `Last done ${Dates.monthDay(done)}` : 'Not done yet'}</span>
      <span>
        ${videoHeart(v)}
        <button class="icon-btn" data-act="edit" data-id="${v.id}" title="Edit">${icon('edit')}</button>
        ${v.noEmbed ? '' : queued ? `<span class="queued">In workout ✓</span>` : `<button class="btn small" data-act="add-q" data-id="${v.id}">${icon('plus')} Add</button>`}
      </span>
    </div>
  </article>`;
}

async function importLink(link) {
  A.ui.adding = true;
  const parsed = YT_.parseLink(link);
  if (!parsed) { A.ui.importMsg = 'That doesn’t look like a YouTube link.'; return render(true); }
  const have = new Set(A.videos.map(v => v.yt));
  let ids = [];
  if (parsed.playlist && !parsed.video) {
    A.ui.importMsg = 'Reading the playlist…';
    render(true);
    ids = await YT_.playlist(parsed.playlist);
    if (!ids.length) { A.ui.importMsg = 'Couldn’t read that playlist. Make sure it’s public or unlisted (not private).'; return render(true); }
  } else ids = [parsed.video];
  const fresh = ids.filter(id => !have.has(id));
  if (!fresh.length) { A.ui.importMsg = ids.length > 1 ? 'Every video in that playlist is already in your library.' : 'That video is already in your library.'; return render(true); }
  let added = 0, needCat = 0, blocked = 0;
  for (const yt of fresh) {
    A.ui.importMsg = `Adding ${added + 1} of ${fresh.length}…`;
    render();
    const info = await YT_.info(yt);
    if (info.missing) continue;
    const cats = YT_.guessCats(info.title, allCats());
    if (!cats.length) needCat++;
    if (info.noEmbed) blocked++;
    await A.store.addVideos([{ yt, title: info.title, seconds: info.seconds, cats, noEmbed: !!info.noEmbed }]);
    added++;
  }
  A.ui.importMsg = `Added ${added} video${added === 1 ? '' : 's'}.` +
    (needCat ? ` ${needCat} need${needCat === 1 ? 's' : ''} a category.` : ' Categories were guessed from the titles — tap to fix any.') +
    (blocked ? ` ${blocked} can’t play inside apps.` : '');
  if (needCat) A.ui.cat = 'none';
  render(true);
}

/* ---------- work out: today's plan + builder ---------- */
function renderPlan() {
  if (!A.ui.mix) A.ui.mix = JSON.parse(JSON.stringify({ ...DEFAULT_MIX, ...((A.room && A.room.mix) || {}) }));
  const mix = A.ui.mix;
  allCats().forEach(c => { if (!mix[c.key]) mix[c.key] = { on: false, min: 0, max: 0 }; }); // parts added later
  const opt = (v, sel, anyLabel) => MINUTES.map(m => `<option value="${m}" ${m === Number(sel) ? 'selected' : ''}>${m ? `${m} min` : anyLabel}</option>`).join('');
  const rows = buildCats().map(c => {
    const m = mix[c.key];
    const n = A.videos.filter(v => !v.noEmbed && (v.cats || []).includes(c.key) && fits(v, m.min, m.max)).length;
    return `<div class="mix-row ${m.on ? 'on' : ''}">
      <label class="switch"><input type="checkbox" data-mix="${c.key}" data-f="on" ${m.on ? 'checked' : ''}><span></span><b>${c.label}</b></label>
      <div class="range">
        <select data-mix="${c.key}" data-f="min" aria-label="${c.short} shortest">${opt(0, m.min, 'Any')}</select>
        <span class="muted">to</span>
        <select data-mix="${c.key}" data-f="max" aria-label="${c.short} longest">${opt(0, m.max, 'Any')}</select>
      </div>
      <span class="muted small match">${n} match${n === 1 ? '' : 'es'}</span>
    </div>`;
  }).join('');
  const tab = A.ui.buildTab || lsGet('bt-build-tab') || 'mix';
  const tabs = [['surprise', 'Surprise'], ['mix', 'Mix'], ['pick', 'Pick'], ['favs', 'Favorites']];
  const warm = buildCats()[0];
  const panels = {
    surprise: `<div class="surprise">
        <p class="muted">${esc(warm ? warm.label : 'A warm-up')} plus 2 random parts${buildCats().some(c => (c.worth || 1) >= 2) ? ` (or one ${esc(buildCats().filter(c => (c.worth || 1) >= 2).map(c => c.short.toLowerCase()).join(' or '))} video in place of both)` : ''}, favoring videos you haven’t done lately.</p>
        <button class="btn primary big-btn" data-act="surprise">${icon('dice')} ${queue().length ? 'Surprise us again' : 'Surprise us'}</button>
      </div>`,
    mix: `<p class="muted small">Pick the parts and how long each can be. One random video per part, in this order.</p>
        <div class="mix">${rows}</div>
        <div class="row-end"><button class="btn primary" data-act="make-mix">Make our workout</button></div>`,
    pick: pickPanel(),
    favs: favsPanel(),
  };
  return `
    <div class="plan-page">
    <section class="page-head"><h1>Work Out</h1></section>
    <div class="plan-stack">
      ${queueCard()}
      <section class="card builder">
        <button type="button" class="card-toggle" data-act="build-toggle" aria-expanded="${builderOpen()}">
          <h2>${queue().length ? 'Change today’s workout' : 'Build today’s workout'}</h2><i aria-hidden="true">${builderOpen() ? '▴' : '▾'}</i>
        </button>
        ${builderOpen() ? `<div class="seg build-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="build-tab" data-k="${k}">${l}</button>`).join('')}</div>
        ${panels[tab] || panels.mix}` : ''}
      </section>
    </div>
    </div>`;
}

// Pick: a quick, searchable list of the library to add videos to today's workout.
function pickPanel() {
  const cat = A.ui.pickCat || 'all';
  const q = (A.ui.pickQ || '').toLowerCase();
  const inQueue = new Set(queue().map(x => x.vid));
  const list = A.videos
    .filter(v => !v.noEmbed && buildable(v) && (cat === 'all' || (v.cats || []).includes(cat)) && (!q || (v.title || '').toLowerCase().includes(q)) && (!A.ui.pickFav || v.fav))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (!A.videos.length) return '<p class="muted">No videos yet. Add your playlist on the <a href="#/library">Library</a> tab.</p>';
  return `
    <div class="chips pick-chips">${[['all', 'All'], ...buildCats().map(c => [c.key, c.short])].map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-act="pick-cat" data-c="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="pick-search-row"><input type="search" data-bind="pq" value="${esc(A.ui.pickQ || '')}" placeholder="Search titles" class="pick-search">${favFilter(A.ui.pickFav, 'pick-fav')}</div>
    <ul class="pick-list">${list.map(v => `<li>
      <img src="${YT_.thumb(v.yt)}" alt="" loading="lazy">
      <div class="q-text"><span class="q-tag">${esc(videoCats(v).map(partName).join(' · '))}</span><span class="q-title">${esc(v.title)}</span><span class="muted small">${mins(v.seconds)}</span></div>
      ${videoHeart(v)}
      ${inQueue.has(v.id) ? `<span class="queued">Added ✓</span>` : `<button class="icon-btn add" data-act="add-q" data-id="${v.id}" title="Add to today">${icon('plus')}</button>`}
    </li>`).join('') || `<li class="muted">${A.ui.pickFav && !A.videos.some(v => v.fav) ? 'No favorite videos yet. Tap the ♡ on a video to add it.' : 'No videos match.'}</li>`}</ul>`;
}

/* ---------- favorite videos (video.fav, shared) ---------- */
const videoHeart = v => `<button class="icon-btn heart ${v.fav ? 'on' : ''}" data-act="video-fav" data-id="${v.id}" title="${v.fav ? 'Favorite video' : 'Add to favorite videos'}" aria-pressed="${!!v.fav}">${icon(v.fav ? 'heart' : 'heartOutline')}</button>`;
// The heart button next to search: tap to show only favorite videos.
const favFilter = (on, act) => {
  const n = A.videos.filter(v => v.fav).length;
  return `<button class="fav-filter ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${!!on}" title="${on ? 'Showing favorites (tap for all)' : 'Show only favorite videos'}">${icon(on ? 'heart' : 'heartOutline')}<span>${n}</span></button>`;
};

// The builder folds away once today's workout is lined up (tap its title to
// open it again). While you're adding videos one at a time in Pick it stays open.
const builderOpen = () => !queue().length || (A.live && A.live.mode === 'finished' && A.live.logged) || A.ui.builderOpen === true;

/* ---------- favorite workouts (room.favorites) ---------- */
const favorites = () => Object.entries((A.room && A.room.favorites) || {}).map(([id, f]) => ({ id, ...f })).sort((a, b) => (b.t || 0) - (a.t || 0));
const favKey = videos => (videos || []).map(v => v.vid).join('|');
const favFor = videos => favorites().find(f => favKey(f.videos) === favKey(videos));
function favButton(videos) {
  if (!videos || !videos.length) return '';
  const f = favFor(videos);
  return `<button class="icon-btn heart ${f ? 'on' : ''}" data-act="fav" data-src="${esc(JSON.stringify(videos.map(v => v.vid)))}" title="${f ? 'Saved as a favorite' : 'Save as a favorite'}" aria-pressed="${!!f}">${icon(f ? 'heart' : 'heartOutline')}</button>`;
}
function favsPanel() {
  const list = favorites();
  if (!list.length) return `<p class="muted">No favorites yet. Tap the ${icon('heartOutline', 'inline')} on a workout (today’s, the finish screen, or in Settings → All workouts) to save it here with a note.</p>`;
  return `<ul class="fav-list">${list.map(f => {
    const secs = f.videos.reduce((t, v) => t + (v.seconds || 0), 0);
    return `<li>
      <div class="row-between"><b class="fav-name">${esc(f.name)}</b><span class="row">
        <button class="icon-btn" data-act="fav-edit" data-id="${f.id}" title="Edit">${icon('edit')}</button>
        <button class="icon-btn heart on" data-act="fav-remove" data-id="${f.id}" title="Remove from favorites">${icon('heart')}</button></span></div>
      <p class="muted small">${esc(f.videos.map(v => partName(v.slot) || 'Video').join(', '))} · ${f.videos.length} video${f.videos.length === 1 ? '' : 's'} · about ${mins(secs)}</p>
      ${f.note ? `<p class="fav-note">${esc(f.note)}</p>` : ''}
      <button class="btn small" data-act="fav-use" data-id="${f.id}">${icon('play')} Use this workout</button>
    </li>`;
  }).join('')}</ul>`;
}
// Name + note, in the app's own dialog. Resolves { name, note } or null.
function askFav(title, name, note) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask';
    wrap.innerHTML = `<form class="ask-box fav-form" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      <label>Name<input name="name" value="${esc(name)}" maxlength="40" required></label>
      <label>Notes<textarea name="note" rows="3" maxlength="400" placeholder="Why we love it, what to swap, how it felt…">${esc(note || '')}</textarea></label>
      <div class="ask-btns"><button type="button" class="btn ghost" data-ans="0">Cancel</button><button class="btn primary">Save</button></div>
    </form>`;
    const done = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('[data-ans="0"]') || e.target === wrap) done(null); });
    wrap.addEventListener('submit', e => {
      e.preventDefault(); e.stopPropagation();
      const d = Object.fromEntries(new FormData(e.target));
      done({ name: d.name.trim() || name, note: d.note.trim() });
    });
    document.body.appendChild(wrap);
    wrap.querySelector('input').select();
  });
}
async function toggleFav(vids) {
  // Find the videos: today's queue, or a logged workout.
  const pool = [queue(), ...A.workouts.map(w => w.videos || [])];
  const videos = pool.find(list => favKey(list) === vids.join('|'));
  if (!videos) return;
  const existing = favFor(videos);
  if (existing) {
    if (!(await ask(`Remove “${existing.name}” from favorites?`, 'Remove', true))) return;
    await A.store.removeRoomField(`favorites.${existing.id}`);
    return toast('Removed from favorites');
  }
  const got = await askFav('Save as a favorite', videos.map(v => partName(v.slot) || 'Video').join(', '), '');
  if (!got) return;
  const id = `f${Date.now().toString(36)}`;
  const clean = videos.map(v => ({ vid: v.vid, yt: v.yt, title: v.title || '', seconds: v.seconds || 0, cats: v.cats || [], slot: v.slot || null, min: v.min || 0, max: v.max || 0 }));
  await A.store.updateRoom({ [`favorites.${id}`]: { name: got.name, note: got.note, videos: clean, t: Date.now() } });
  toast('Saved to favorites');
}

/* ---------- workout ---------- */
function renderWorkout() {
  const s = A.live;
  const q = queue();
  if (!playerView()) return renderPlan();
  if (s.mode === 'finished') return finishedPanel();
  const it = q[s.index];
  const playing = s.mode === 'playing';
  const tag = (catOf(it.slot) || {}).label || 'Video';
  const auto = Number(settings().autoNext) || 0;
  const readyNext = s.mode === 'ready' && s.rest;
  return `<section class="card panel ${A.ui.big ? 'bigbar' : ''}">
    <p class="eyebrow">Video ${s.index + 1} of ${q.length} · ${esc(tag)}</p>
    <h2 class="now-title">${esc(it.title)}</h2>
    <div class="countdown" data-tick="count" hidden>
      ${s.rest ? `<p>Rest · up next in <b></b></p><div class="row"><button class="btn small" data-act="more-rest">+30s</button><button class="btn primary small" data-act="skip-rest">Start now</button></div>` : `<p>Starting in <b></b></p>`}
    </div>
    ${readyNext ? `<div class="countdown up-next"><p>Up next. Press play when you’re both ready${auto ? '' : ' (you can set an auto-start in Settings)'}.</p></div>` : ''}
    <div class="progress" data-act="seek-bar"><div data-tick="bar"></div></div>
    <div class="times"><span data-tick="time"></span><span data-tick="left"></span></div>
    <div class="controls">
      <button class="ctl" data-act="go" data-i="${s.index - 1}" ${s.index === 0 ? 'disabled' : ''} aria-label="Previous video">${icon('prev')}</button>
      <button class="ctl" data-act="seek" data-d="-15" aria-label="Back 15 seconds">${icon('back15')}</button>
      <button class="ctl main" data-act="${playing ? 'pause' : 'play'}" aria-label="${playing ? 'Pause' : 'Play'}">${icon(playing ? 'pause' : 'play')}</button>
      <button class="ctl" data-act="seek" data-d="15" aria-label="Forward 15 seconds">${icon('fwd15')}</button>
      <button class="ctl" data-act="go" data-i="${s.index + 1}" ${s.index >= q.length - 1 ? 'disabled' : ''} aria-label="Next video">${icon('next')}</button>
    </div>
    <div class="row-between panel-foot">
      <span class="together">${online(other()) ? `<i class="dot on"></i>${esc(nameOf(other()))} is here` : `<i class="dot"></i>${esc(nameOf(other()))} isn’t connected`}</span>
      <button class="btn ghost small" data-act="big">${icon(A.ui.big ? 'shrink' : 'expand')} ${A.ui.big ? 'Exit big screen' : 'Big screen'}</button>
    </div>
    <div class="up-list">
      <h3>This workout</h3>
      ${queueList({ jump: true, compact: true })}
      <button class="link danger" data-act="end">End workout</button>
    </div>
  </section>`;
}

function finishedPanel() {
  const { count, streak, goal } = streakInfo();
  const logged = A.live.logged;
  return `<section class="card panel finished">
    ${flower(logged ? Math.min(count, goal) : Math.min(count + 1, goal), 150, '', goal)}
    <h2>${logged ? 'Logged!' : 'Workout complete!'}</h2>
    <p class="fav-line">${favButton(queue())}<span class="muted small">${favFor(queue()) ? 'In your favorites' : 'Love this one? Save it'}</span></p>
    ${logged
      ? `<p class="muted">${count >= goal ? `Full bloom this week${streak > 1 ? ` · ${streak}-week streak` : ''}!` : `${count} of ${goal} this week. ${goal - count} to go.`}</p>
         <a class="btn primary wide" href="#/">Back home</a>`
      : `<p class="muted">${queue().length} videos · about ${mins(queue().reduce((s, x) => s + (x.seconds || 0), 0))}</p>
         <button class="btn primary wide big-btn" data-act="did-it">We did it!</button>
         <button class="link" data-act="end">Didn’t finish? Don’t log it</button>`}
  </section>`;
}

function setBig(on) {
  A.ui.big = on;
  document.body.classList.toggle('big', on);
  const el = document.documentElement;
  try {
    if (on && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (e) {}
}
// In big screen the controls fade after a few still seconds; any move or tap brings them back.
let idleTimer;
['mousemove', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (A.ui.big) idleTimer = setTimeout(() => document.body.classList.add('idle'), 3500);
}, { passive: true }));
document.addEventListener('fullscreenchange',() => { if (!document.fullscreenElement && A.ui.big) { A.ui.big = false; document.body.classList.remove('big'); render(true); } });

async function logWorkout() {
  const q = queue();
  A.ui.justLogged = true; // keep the "Logged!" screen up until you leave it
  const ok = await A.store.changeLive(c => (c.mode === 'finished' && !c.logged ? { logged: true, by: A.me, action: 'log' } : null));
  if (!ok) return;
  await A.store.addWorkout({
    day: Dates.today(),
    videos: q.map(x => ({ vid: x.vid, yt: x.yt, title: x.title, seconds: x.seconds || 0, slot: x.slot || null })),
    seconds: q.reduce((s, x) => s + (x.seconds || 0), 0),
    by: A.me,
  });
}

/* ---------- settings ---------- */
// Whether "All workouts" is folded up (remembered on this device).
const historyFolded = () => lsGet('bt-history-folded') === '1';
// The new code, in the app's own dialog. Resolves the code or null.
function askCode() {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask';
    wrap.innerHTML = `<form class="ask-box fav-form" role="dialog" aria-modal="true">
      <h3>Change our code</h3>
      <p class="muted small">Everything moves to the new code. The old one stops working, and ${esc(nameOf(other()))}’s devices will be logged out until she signs in with the new code.</p>
      <label>New code<input name="code" minlength="8" maxlength="60" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="at least 8 characters"></label>
      <div class="ask-btns"><button type="button" class="btn ghost" data-ans="0">Cancel</button><button class="btn primary">Change code</button></div>
    </form>`;
    const done = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('[data-ans="0"]') || e.target === wrap) done(null); });
    wrap.addEventListener('submit', e => {
      e.preventDefault(); e.stopPropagation();
      const code = new FormData(e.target).get('code').trim().toLowerCase();
      if (code.length < 8) return toast('Make it at least 8 characters');
      if (/[\/]/.test(code)) return toast('Codes can’t have a slash in them');
      if (code === A.code) return done(null);
      done(code);
    });
    document.body.appendChild(wrap);
    wrap.querySelector('input').focus();
  });
}
// The last 2 weeks are listed; anything older folds away by month.
function historyList(history) {
  const row = w => `<li><b>${Dates.nice(w.day)}</b><span class="muted">${w.solo ? `Solo · ${esc(nameOf(w.by))}` : w.videos && w.videos.length ? `${w.videos.length} videos · ${mins(w.seconds)}` : 'Workout'}</span>${favButton(w.videos)}<button class="icon-btn" data-act="del-workout" data-id="${w.id}" title="Delete">${icon('x')}</button></li>`;
  const cutoff = Dates.addDays(Dates.today(), -13);
  const recent = history.filter(w => w.day >= cutoff);
  const older = history.filter(w => w.day < cutoff);
  const months = [];
  older.forEach(w => {
    const key = w.day.slice(0, 7);
    let m = months.find(x => x.key === key);
    if (!m) months.push(m = { key, list: [] });
    m.list.push(w);
  });
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const open = A.ui.openMonths || (A.ui.openMonths = new Set());
  return `
    <p class="label">Last 2 weeks</p>
    <ul class="recent">${recent.map(row).join('') || '<li class="muted">No workouts in the last 2 weeks.</li>'}</ul>
    ${months.length ? `<div class="older">
      <button type="button" class="older-toggle" data-act="older" aria-expanded="${!!A.ui.showOlder}">Older workouts <span class="muted">${older.length}</span><i aria-hidden="true">${A.ui.showOlder ? '▴' : '▾'}</i></button>
      ${A.ui.showOlder ? months.map(m => {
        const [y, mo] = m.key.split('-').map(Number);
        const isOpen = open.has(m.key);
        return `<div class="month">
          <button type="button" class="month-toggle" data-act="month" data-k="${m.key}" aria-expanded="${isOpen}">${names[mo - 1]} ${y} <span class="muted">${m.list.length}</span><i aria-hidden="true">${isOpen ? '▴' : '▾'}</i></button>
          ${isOpen ? `<ul class="recent">${m.list.map(row).join('')}</ul>` : ''}
        </div>`;
      }).join('') : ''}
    </div>` : ''}`;
}
// A small month calendar for picking a past day (styled like the rest of the
// app, unlike the browser's own date picker). Future days can't be picked;
// days you already worked out get a little mark.
function calendar() {
  const today = Dates.today();
  const month = A.ui.calMonth || today.slice(0, 7);
  const first = `${month}-01`;
  const start = Dates.addDays(first, -Dates.weekday(first));
  const done = new Set(A.workouts.map(w => w.day));
  const picked = A.ui.missedDay || today;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = Dates.addDays(start, i);
    if (i >= 35 && d.slice(0, 7) !== month) break;
    const cls = [d.slice(0, 7) !== month ? 'out' : '', d === today ? 'today' : '', d === picked ? 'on' : '', done.has(d) ? 'done' : ''].join(' ');
    cells.push(`<button type="button" class="cal-day ${cls}" data-act="cal-pick" data-day="${d}" ${d > today ? 'disabled' : ''}>${Number(d.slice(8))}</button>`);
  }
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-').map(Number);
  return `<div class="cal" role="dialog" aria-label="Pick a day">
    <div class="cal-head">
      <button type="button" class="icon-btn" data-act="cal-month" data-d="-1" aria-label="Previous month">‹</button>
      <b>${names[m - 1]} ${y}</b>
      <button type="button" class="icon-btn" data-act="cal-month" data-d="1" aria-label="Next month" ${month >= today.slice(0, 7) ? 'disabled' : ''}>›</button>
    </div>
    <div class="cal-grid">${Dates.SHORT.map(d => `<span>${d[0]}</span>`).join('')}${cells.join('')}</div>
    <p class="muted small cal-key"><i></i> already logged</p>
  </div>`;
}
function shiftMonth(month, d) {
  let [y, m] = month.split('-').map(Number);
  m += d;
  if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
const saveCats = list => A.store.updateRoom({ cats: list });
function renderSettings() {
  const look = lsGet('bt-look') || 'nook';
  const auto = Number(settings().autoNext) || 0;
  const history = recentWorkouts();
  return `
    <section class="page-head"><h1>Settings</h1></section>
    <div class="settings-grid">
      <section class="card">
        <h2>Just for you</h2>
        <p class="muted small">These only change this device.</p>
        <form data-form="name" class="name-form">
          <label>What should I call you?<input name="name" value="${esc(nameOf(A.me))}" maxlength="24" required></label>
          <button class="btn small">Save</button>
        </form>
        <p class="label">Look</p>
        <div class="looks">${LOOKS.map(l => {
          const mine = customFor(l.key);
          const sw = [mine['--bg'] || l.swatch[0], mine['--primary'] || l.swatch[1], mine['--accent'] || l.swatch[2]];
          return `<button class="look ${look === l.key ? 'on' : ''}" data-act="look" data-k="${l.key}">
          <span class="sw">${sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>${l.name}${Object.keys(mine).length ? '<em>Customized</em>' : ''}</button>`;
        }).join('')}</div>
        ${colorEditor(look)}
        <p class="muted small">Using this device as <b>${esc(nameOf(A.me))}</b>. <button class="link" data-act="switch-me">Switch to ${esc(nameOf(other()))}</button></p>
      </section>
      <section class="card">
        <h2>Shared Settings</h2>
        <p class="label">Weekly goal</p>
        <div class="stepper">
          <button class="icon-btn" data-act="goal" data-d="-1" ${goalFor(Dates.thisWeek()) <= 1 ? 'disabled' : ''} aria-label="Fewer">−</button>
          <b>${goalFor(Dates.thisWeek())}</b><span>workout${goalFor(Dates.thisWeek()) === 1 ? '' : 's'} a week</span>
          <button class="icon-btn" data-act="goal" data-d="1" ${goalFor(Dates.thisWeek()) >= 7 ? 'disabled' : ''} aria-label="More">+</button>
        </div>
        <p class="muted small">Counts from this week on. Past weeks keep the goal they had, so your streak stays safe.</p>
        <p class="label">When a video ends</p>
        <div class="seg">${[[0, 'Wait for a tap'], [30, '30 sec'], [45, '45 sec'], [60, '1 min']].map(([v, l]) => `<button class="${auto === v ? 'on' : ''}" data-act="auto" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="muted small">${auto ? `The next video starts on its own after ${auto} seconds of rest (you can skip or add time).` : 'The next video loads and waits until one of you presses play.'}</p>
        <label class="switch row"><input type="checkbox" data-act="solo-toggle" ${settings().solo ? 'checked' : ''}><span></span><b>Solo workouts</b></label>
        <p class="muted small">Shows a “Log a solo workout” button that counts toward the streak.</p>
      </section>
      <section class="card parts">
        <h2>Workout parts</h2>
        <p class="muted small">The body parts you tag videos with and build mixes from. The first one used in workouts is your warm-up: Surprise us always starts with it.</p>
        <ul class="part-list">${allCats().map((c, i, list) => `<li>
          <input value="${esc(c.short)}" data-part="${c.key}" maxlength="24" aria-label="Part name">
          <span class="muted small">${(n => `${n} video${n === 1 ? '' : 's'}`)(A.videos.filter(v => (v.cats || []).includes(c.key)).length)}</span>
          <button class="use ${c.use === false ? '' : 'on'}" data-act="part-use" data-k="${c.key}" title="${c.use === false ? 'Library only: not used in workouts' : 'Used in workouts'}" aria-pressed="${c.use !== false}">${c.use === false ? 'Library' : 'Workouts'}</button>
          ${i === 0 ? '<span class="worth-slot"></span>' : `<button class="worth ${(c.worth || 1) >= 2 ? 'on' : ''}" data-act="part-worth" data-k="${c.key}" title="Counts as 2 parts in Surprise us" aria-pressed="${(c.worth || 1) >= 2}">×2</button>`}
          <button class="icon-btn" data-act="part-move" data-k="${c.key}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('up')}</button>
          <button class="icon-btn" data-act="part-move" data-k="${c.key}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} title="Move down">${icon('down')}</button>
          <button class="icon-btn" data-act="part-remove" data-k="${c.key}" ${list.length <= 1 ? 'disabled' : ''} title="Remove">${icon('x')}</button>
        </li>`).join('')}</ul>
        <form data-form="add-part" class="missed">
          <label>Add a part<input name="name" placeholder="Glutes, Shoulders, Cardio…" maxlength="24" required></label>
          <button class="btn small">Add</button>
        </form>
        <p class="muted small">New parts tag matching videos automatically from their titles. <b>×2</b> means one of those videos counts as two parts, so Surprise us picks it instead of two separate parts (like Full body). Tap <b>Workouts</b> to switch a part to <b>Library</b>: its videos stay tagged and saved, but aren’t used to build workouts until you switch it back.</p>
      </section>
      <section class="card history">
        <button type="button" class="card-toggle" data-act="toggle-history" aria-expanded="${!historyFolded()}">
          <h2>All workouts</h2><span class="muted small">${A.workouts.length}</span><i aria-hidden="true">${historyFolded() ? '▾' : '▴'}</i>
        </button>
        ${historyFolded() ? '' : `<form data-form="missed" class="missed">
          <input type="hidden" name="day" value="${A.ui.missedDay || Dates.today()}">
          <div class="field"><span class="field-label">Forgot to log one?</span>
            <button type="button" class="date-btn" data-act="cal-toggle" aria-expanded="${!!A.ui.calOpen}">${Dates.nice(A.ui.missedDay || Dates.today())}<span aria-hidden="true">▾</span></button>
          </div>
          <button class="btn small">Add it</button>
        </form>
        ${A.ui.calOpen ? calendar() : ''}
        ${historyList(history)}`}
      </section>
      <section class="card">
        <h2>Account</h2>
        <p class="label first">Our code</p>
        <div class="code-row"><code>${esc(A.code)}</code><button class="btn small" data-act="copy-code">Copy</button><button class="btn small" data-act="change-code">Change</button></div>
        <p class="muted small">Your shared login. To use the app on another device, open it and choose <b>Sign in with our code</b>.</p>
        <button class="btn ghost logout" data-act="leave">Log out</button>
      </section>
    </div>`;
}

/* Custom colors: saved per look, on this device only (localStorage bt-custom). */
const COLOR_TOKENS = [
  ['--bg', 'Background'], ['--surface', 'Cards'], ['--surface-2', 'Soft fills & chips'],
  ['--primary', 'Buttons'], ['--heading', 'Headings'], ['--ink', 'Text'], ['--muted', 'Secondary text'],
  ['--accent', 'Petals & highlights'], ['--accent-soft', 'Workout days'], ['--accent-ink', 'Streak & accent words'],
  ['--p1', 'p1'], ['--p2', 'p2'],
];
const getCustom = () => { try { return JSON.parse(lsGet('bt-custom')) || {}; } catch (e) { return {}; } };
const customFor = look => getCustom()[look] || {};
function saveCustom(look, colors) {
  const all = getCustom();
  if (colors && Object.keys(colors).length) all[look] = colors; else delete all[look];
  lsSet('bt-custom', JSON.stringify(all));
}
// White or dark text on a button, whichever reads better.
function onColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return L > 0.4 ? '#1F0503' : '#FFFFFF';
}
function applyCustom() {
  const root = document.documentElement.style;
  [...COLOR_TOKENS.map(t => t[0]), '--on-primary'].forEach(k => root.removeProperty(k));
  const mine = customFor(document.documentElement.dataset.look);
  Object.entries(mine).forEach(([k, v]) => root.setProperty(k, v));
  if (mine['--primary']) root.setProperty('--on-primary', onColor(mine['--primary']));
}
// The look's own colors, ignoring anything customized.
function lookDefaults() {
  const root = document.documentElement.style;
  const saved = COLOR_TOKENS.map(([k]) => [k, root.getPropertyValue(k)]);
  saved.forEach(([k]) => root.removeProperty(k));
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  COLOR_TOKENS.forEach(([k]) => { out[k] = toHex(cs.getPropertyValue(k).trim() || cs.getPropertyValue('--ink').trim()); });
  applyCustom();
  return out;
}
function toHex(c) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c.slice(1).split('').map(x => x + x).join('')).toUpperCase();
  const m = c.match(/\d+(\.\d+)?/g);
  return m ? '#' + m.slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase() : '#000000';
}
function colorEditor(look) {
  const meta = LOOKS.find(l => l.key === look) || LOOKS[0];
  if (look === 'auto') return '<p class="muted small">“Match my device” switches between two looks on its own. To use your own colors, pick a look above and customize it.</p>';
  if (!A.ui.customizing) return `<button class="btn ghost small" data-act="customize">Customize ${meta.name} colors</button>`;
  const defs = lookDefaults();
  const mine = customFor(look);
  const dropper = 'EyeDropper' in window;
  const rows = COLOR_TOKENS.map(([k, label]) => {
    const v = mine[k] || defs[k];
    const name = k === '--p1' || k === '--p2' ? `${nameOf(k.slice(2))}’s name` : label;
    return `<div class="color-row ${mine[k] ? 'changed' : ''}">
      <span>${esc(name)}</span>
      <input type="color" data-color="${k}" value="${v}" aria-label="${esc(name)} color">
      <input class="hex" data-hex="${k}" value="${v}" maxlength="7" spellcheck="false" autocapitalize="characters" aria-label="${esc(name)} color code">
      ${dropper ? `<button class="icon-btn" data-act="dropper" data-k="${k}" title="Pick a color from the screen">${icon('dropper')}</button>` : ''}
      <button class="icon-btn" data-act="reset-color" data-k="${k}" title="Back to default" ${mine[k] ? '' : 'hidden-slot disabled'}>${icon('reroll')}</button>
    </div>`;
  }).join('');
  return `<div class="color-editor">
    <div class="row-between"><p class="label">${meta.name} colors</p><button class="link" data-act="customize">Done</button></div>
    <p class="muted small">Tap a swatch for the color wheel${dropper ? ', use the dropper to grab a color from the screen,' : ''} or type a code like #93AEBF. Only this device changes.</p>
    ${rows}
    <button class="btn ghost small" data-act="reset-look" ${Object.keys(mine).length ? '' : 'disabled'}>Reset ${meta.name} to default</button>
  </div>`;
}
function setColor(k, hex) {
  const look = document.documentElement.dataset.look;
  const mine = { ...customFor(look), [k]: hex.toUpperCase() };
  saveCustom(look, mine);
  applyCustom();
  updateThemeMeta();
}
function updateThemeMeta() {
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta && bg) meta.content = bg;
}

function applyLook(key) {
  document.documentElement.dataset.look = key;
  lsSet('bt-look', key);
  applyCustom();
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta && bg) meta.content = bg;
}

/* ---------- events ---------- */
async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const i = Number(el.dataset.i);
  const s = A.live;
  switch (act) {
    case 'tap-in': Sync.tapIn(); break;
    case 'be':
      A.me = el.dataset.p;
      setMe(A.me);
      startRoom();
      break;
    case 'plan': {
      const week = el.dataset.week;
      const plan = planFor(week).slice();
      const idx = plan.indexOf(i);
      idx >= 0 ? plan.splice(idx, 1) : plan.push(i);
      plan.sort();
      A.store.updateRoom({ [`plans.${planKey(week)}`]: plan });
      break;
    }
    case 'week': A.ui.weekOffset += Number(el.dataset.d); render(true); break;
    case 'solo':
      if (weekDays(Dates.thisWeek()).has(Dates.today()) && !await ask('Today already counts. Log a solo workout anyway?', 'Log it')) return;
      await A.store.addWorkout({ day: Dates.today(), solo: true, by: A.me, videos: [], seconds: 0 });
      toast('Solo workout logged');
      break;
    case 'surprise': surprise(); break;
    case 'make-mix':
      A.store.updateRoom({ mix: A.ui.mix });
      buildMix(A.ui.mix);
      break;
    case 'clear': if (await ask('Clear today’s workout?', 'Clear', true)) editQueue(q => { q.length = 0; }); break;
    case 'reroll': reroll(i); break;
    case 'remove': editQueue((q, cur) => { if (i <= cur) return false; q.splice(i, 1); }); break;
    case 'move': {
      const j = i + Number(el.dataset.d);
      editQueue((q, cur) => { if (i <= cur || j <= cur || j >= q.length) return false; [q[i], q[j]] = [q[j], q[i]]; });
      break;
    }
    case 'start':
      Sync.tapIn();
      await Sync.cmd.start(queue());
      location.hash = '#/workout';
      break;
    case 'play': Sync.tapIn(); Sync.cmd.play(); break;
    case 'pause': Sync.cmd.pause(); break;
    case 'seek': Sync.cmd.seekBy(Number(el.dataset.d)); break;
    case 'go':
      if (s && isRunning() && i !== s.index) Sync.cmd.go(i);
      break;
    case 'skip-rest': Sync.tapIn(); Sync.cmd.skipRest(); break;
    case 'more-rest': Sync.cmd.moreRest(30); break;
    case 'seek-bar': {
      const st = Sync.status();
      if (!st.dur) return;
      const r = el.getBoundingClientRect();
      const pos = ((e.clientX - r.left) / r.width) * st.dur;
      Sync.cmd.seekBy(pos - st.pos);
      break;
    }
    case 'end':
      if (await ask(s && s.mode === 'finished' ? 'Skip logging this workout?' : 'End the workout for both of you?', s && s.mode === 'finished' ? 'Don’t log' : 'End workout', true)) { Sync.cmd.end(); location.hash = '#/'; }
      break;
    case 'did-it': await logWorkout(); break;
    case 'big': setBig(!A.ui.big); render(true); break;
    case 'toggle-add': A.ui.adding = !A.ui.adding; A.ui.importMsg = ''; render(true); break;
    case 'cat': A.ui.cat = el.dataset.c; render(true); break;
    case 'tag': {
      const v = A.videos.find(x => x.id === el.dataset.id);
      if (!v) return;
      const cats = new Set(v.cats || []);
      cats.has(el.dataset.c) ? cats.delete(el.dataset.c) : cats.add(el.dataset.c);
      A.store.updateVideo(v.id, { cats: allCats().map(c => c.key).filter(k => cats.has(k)) });
      break;
    }
    case 'add-q': {
      const v = A.videos.find(x => x.id === el.dataset.id);
      if (A.route === 'workout') A.ui.builderOpen = true; // keep Pick open while adding
      if (v) addToQueue(v);
      break;
    }
    case 'build-toggle': A.ui.builderOpen = !builderOpen(); render(true); break;
    case 'edit': A.ui.editing = el.dataset.id || null; render(true); break;
    case 'del-video':
      if (await ask('Delete this video from the library? (Past workouts keep their record.)', 'Delete', true)) { A.ui.editing = null; await A.store.deleteVideo(el.dataset.id); }
      break;
    case 'look':
      applyLook(el.dataset.k);
      // A blank look is only useful once you paint it: open the editor right away.
      if (/^mine/.test(el.dataset.k) && !Object.keys(customFor(el.dataset.k)).length) A.ui.customizing = true;
      render(true);
      break;
    case 'goal': {
      const n = Math.min(7, Math.max(1, goalFor(Dates.thisWeek()) + Number(el.dataset.d)));
      A.store.updateRoom({ [`goals.${planKey(Dates.thisWeek())}`]: n });
      break;
    }
    case 'part-move': {
      const list = allCats().map(c => ({ ...c }));
      const i = list.findIndex(c => c.key === el.dataset.k), j = i + Number(el.dataset.d);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      saveCats(list);
      break;
    }
    case 'part-use': {
      const c = catOf(el.dataset.k);
      saveCats(allCats().map(x => (x.key === el.dataset.k ? { ...x, use: x.use === false } : x)));
      toast(c.use === false ? `${c.short} videos can be used in workouts` : `${c.short} is library only for now`);
      break;
    }
    case 'part-worth':
      saveCats(allCats().map(c => (c.key === el.dataset.k ? { ...c, worth: (c.worth || 1) >= 2 ? 1 : 2 } : c)));
      break;
    case 'part-remove': {
      const c = catOf(el.dataset.k);
      if (!c || !await ask(`Remove ${c.short}? Videos keep their other parts; past workouts are unchanged.`, 'Remove', true)) return;
      saveCats(allCats().filter(x => x.key !== c.key));
      break;
    }
    case 'toggle-history': lsSet('bt-history-folded', historyFolded() ? null : '1'); render(true); break;
    case 'older': A.ui.showOlder = !A.ui.showOlder; render(true); break;
    case 'month': {
      const open = A.ui.openMonths || (A.ui.openMonths = new Set());
      open.has(el.dataset.k) ? open.delete(el.dataset.k) : open.add(el.dataset.k);
      render(true);
      break;
    }
    case 'video-fav': {
      const v = A.videos.find(x => x.id === el.dataset.id);
      if (v) A.store.updateVideo(v.id, { fav: !v.fav });
      break;
    }
    case 'lib-fav': A.ui.favOnly = !A.ui.favOnly; render(true); break;
    case 'pick-fav': A.ui.pickFav = !A.ui.pickFav; render(true); break;
    case 'build-tab': A.ui.buildTab = el.dataset.k; lsSet('bt-build-tab', el.dataset.k); render(true); break;
    case 'pick-cat': A.ui.pickCat = el.dataset.c; render(true); break;
    case 'fav': await toggleFav(JSON.parse(el.dataset.src)); break;
    case 'fav-remove': {
      const f = favorites().find(x => x.id === el.dataset.id);
      if (f && await ask(`Remove “${f.name}” from favorites?`, 'Remove', true)) { await A.store.removeRoomField(`favorites.${f.id}`); toast('Removed from favorites'); }
      break;
    }
    case 'fav-edit': {
      const f = favorites().find(x => x.id === el.dataset.id);
      if (!f) return;
      const got = await askFav('Edit favorite', f.name, f.note);
      if (got) await A.store.updateRoom({ [`favorites.${f.id}.name`]: got.name, [`favorites.${f.id}.note`]: got.note });
      break;
    }
    case 'fav-use': {
      const f = favorites().find(x => x.id === el.dataset.id);
      if (!f) return;
      if (queue().length && !(A.live && A.live.mode === 'finished' && A.live.logged) && !(await ask('Replace today’s workout with this favorite?', 'Replace'))) return;
      // Skip any video that's since been removed from the library.
      const have = new Set(A.videos.map(v => v.id));
      const list = f.videos.filter(v => have.has(v.vid));
      if (!list.length) return toast('Those videos aren’t in the library anymore');
      await editQueue(q => { q.splice(0, q.length, ...list); });
      A.ui.builderOpen = false;
      toast(list.length < f.videos.length ? `Loaded (${f.videos.length - list.length} video no longer in the library)` : `“${f.name}” is ready`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    }
    case 'cal-toggle':
      A.ui.calOpen = !A.ui.calOpen;
      A.ui.calMonth = (A.ui.missedDay || Dates.today()).slice(0, 7);
      render(true);
      break;
    case 'cal-month': A.ui.calMonth = shiftMonth(A.ui.calMonth || Dates.today().slice(0, 7), Number(el.dataset.d)); render(true); break;
    case 'cal-pick': A.ui.missedDay = el.dataset.day; A.ui.calOpen = false; render(true); break;
    case 'customize': A.ui.customizing = !A.ui.customizing; render(true); break;
    case 'dropper':
      try {
        const { sRGBHex } = await new EyeDropper().open();
        setColor(el.dataset.k, toHex(sRGBHex));
        render(true);
      } catch (err) { /* cancelled */ }
      break;
    case 'reset-color': {
      const look = document.documentElement.dataset.look;
      const mine = { ...customFor(look) };
      delete mine[el.dataset.k];
      saveCustom(look, mine);
      applyCustom(); updateThemeMeta(); render(true);
      break;
    }
    case 'reset-look': {
      const name = (LOOKS.find(l => l.key === document.documentElement.dataset.look) || {}).name;
      if (!await ask(`Put ${name} back to its original colors?`, 'Reset')) return;
      saveCustom(document.documentElement.dataset.look, null);
      applyCustom(); updateThemeMeta(); render(true);
      break;
    }
    case 'switch-me':
      if (!await ask(`Use this device as ${nameOf(other())}?`, 'Switch')) return;
      setMe(other());
      location.reload();
      break;
    case 'auto': A.store.updateRoom({ 'settings.autoNext': Number(el.dataset.v) }); break;
    case 'copy-code':
      try { await navigator.clipboard.writeText(A.code); toast('Copied'); } catch (err) { toast(A.code); }
      break;
    case 'del-workout':
      if (await ask('Delete this workout? It will come off the streak.', 'Delete', true)) { await A.store.deleteWorkout(el.dataset.id); toast('Workout deleted'); }
      break;
    case 'change-code': {
      const next = await askCode();
      if (!next) return;
      A.moving = true;
      try {
        await A.store.moveRoom(next);
      } catch (err) {
        A.moving = false;
        return toast(err.message === 'taken' ? 'That code is already used — try another' : 'Couldn’t change the code. Check your connection.');
      }
      lsSet('bt-room', next);
      sessionStorage.setItem('bt-toast', `Our code is now ${next}. Send it to ${nameOf(other())}!`);
      location.reload();
      return;
    }
    case 'join-create': renderJoin('', true); break;
    case 'join-signin': renderJoin(); break;
    case 'leave':
      if (!await ask('Log out?', 'Log out')) return;
      lsSet('bt-last-code', A.code); // so signing back in is one tap
      lsSet('bt-room', null); setMe(null);
      location.hash = '';
      location.reload();
      break;
  }
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.color || el.dataset.hex) { el.blur(); return render(true); }
  if (el.dataset.part) {
    const name = el.value.trim();
    if (!name) return render(true);
    saveCats(allCats().map(c => (c.key === el.dataset.part ? { ...c, short: name, label: name } : c)));
    return;
  }
  if (el.dataset.act === 'solo-toggle') return A.store.updateRoom({ 'settings.solo': el.checked });
  if (el.dataset.mix) {
    const m = A.ui.mix[el.dataset.mix];
    const f = el.dataset.f;
    m[f] = f === 'on' ? el.checked : Number(el.value);
    if (f === 'min' && m.max && m.min > m.max) m.max = m.min;
    if (f === 'max' && m.max && m.min > m.max) m.min = m.max;
    return render(true);
  }
  if (el.dataset.bind === 'len' || el.dataset.bind === 'sort') { A.ui[el.dataset.bind] = el.value; render(true); }
}

let searchTimer;
function onInput(e) {
  const t = e.target;
  if (t.dataset.color) {
    setColor(t.dataset.color, t.value);
    const hex = $view.querySelector(`[data-hex="${t.dataset.color}"]`);
    if (hex) hex.value = t.value.toUpperCase();
    return;
  }
  if (t.dataset.hex) {
    let v = t.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      setColor(t.dataset.hex, v);
      const sw = $view.querySelector(`[data-color="${t.dataset.hex}"]`);
      if (sw) sw.value = v.toLowerCase();
    }
    return;
  }
  const bind = e.target.dataset.bind;
  if (bind === 'q' || bind === 'pq') {
    A.ui[bind === 'q' ? 'q' : 'pickQ'] = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const pos = e.target.selectionStart;
      render(true);
      const input = $view.querySelector(`[data-bind=${bind}]`);
      if (input) { input.focus(); input.setSelectionRange(pos, pos); }
    }, 200);
  }
}

async function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button:not([type=button])');
  const busy = on => { if (btn) btn.disabled = on; };
  try {
    switch (form.dataset.form) {
      case 'create': {
        const code = data.code.trim().toLowerCase();
        if (code.length < 8) return toast('Make the code at least 8 characters');
        if (/[\/]/.test(code)) return toast('Codes can’t have a slash in them');
        busy(true);
        if (await A.store.roomExists(code)) { busy(false); return toast('That code is taken — try another'); }
        await A.store.createRoom(code, {
          names: { p1: data.n1.trim() || 'Bella', p2: data.n2.trim() || 'Izzy' },
          settings: { autoNext: 0, solo: false }, plans: {}, mix: DEFAULT_MIX, cats: DEFAULT_CATS, goals: {},
        });
        lsSet('bt-room', code); setMe('p1');
        A.code = code; A.me = 'p1';
        openRoom();
        break;
      }
      case 'join': {
        const code = data.code.trim().toLowerCase();
        busy(true);
        if (!(await A.store.roomExists(code))) { busy(false); return renderJoin('Nothing is saved under that code. Check the spelling (it’s all lowercase).'); }
        lsSet('bt-room', code);
        A.code = code;
        A.me = getMe();
        openRoom();
        break;
      }
      case 'add': {
        busy(true);
        await importLink(data.link);
        break;
      }
      case 'edit': {
        const patch = { title: data.title.trim() || 'Untitled video' };
        if (data.mins) patch.seconds = Math.round(Number(data.mins) * 60);
        await A.store.updateVideo(form.dataset.id, patch);
        A.ui.editing = null;
        render(true);
        break;
      }
      case 'name':
        await A.store.updateRoom({ [`names.${A.me}`]: data.name.trim() });
        document.activeElement.blur();
        toast(`Hi, ${data.name.trim()}!`);
        break;
      case 'add-part': {
        const name = data.name.trim();
        if (allCats().some(c => c.short.toLowerCase() === name.toLowerCase())) return toast(`${name} is already a part`);
        const key = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part'}-${Date.now().toString(36).slice(-4)}`;
        const part = { key, label: name, short: name };
        await saveCats([...allCats(), part]);
        // Tag videos whose titles mention it.
        const matches = A.videos.filter(v => YT_.guessCats(v.title, [part]).length);
        await Promise.all(matches.map(v => A.store.updateVideo(v.id, { cats: [...(v.cats || []), key] })));
        form.reset();
        toast(`Added ${name}${matches.length ? ` · tagged ${matches.length} video${matches.length === 1 ? '' : 's'}` : ''}`);
        break;
      }
      case 'missed':
        await A.store.addWorkout({ day: data.day, videos: [], seconds: 0, by: A.me, missed: true });
        A.ui.missedDay = null; A.ui.calOpen = false;
        toast(`Added ${Dates.nice(data.day)}`);
        break;
    }
  } catch (err) {
    console.error(err);
    toast('Something went wrong — check your connection');
    busy(false);
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
