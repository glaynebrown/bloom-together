/* Sample mode: lets you try the app before Firebase is set up. Same functions
   as store.js, but the room is saved in this browser only. Open the app in two
   tabs (one as Bella, one as Izzy) and they stay in sync with each other. */
const DemoStore = (() => {
  const KEY = 'bt-demo';
  const channel = 'BroadcastChannel' in self ? new BroadcastChannel('bt-demo') : null;
  const listeners = { room: [], videos: [], live: [], workouts: [], presence: [] };
  let code = null;
  let n = 0;
  const newId = () => `d${Date.now().toString(36)}${(n++).toString(36)}`;
  const clone = x => JSON.parse(JSON.stringify(x));

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function roomData() {
    const all = load();
    return all[code] || null;
  }
  function save(fn) {
    const all = load();
    if (!all[code]) return; // the sample room was cleared from this browser
    fn(all[code]);
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    emit();
    if (channel) channel.postMessage(code);
  }

  const toList = obj => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
  function emit() {
    const r = roomData();
    if (!r) { setTimeout(() => listeners.room.forEach(cb => cb(null))); return; }
    setTimeout(() => {
      listeners.room.forEach(cb => cb(clone(r.room)));
      listeners.videos.forEach(cb => cb(toList(r.videos)));
      listeners.live.forEach(cb => cb(r.live ? clone(r.live) : null));
      listeners.workouts.forEach(cb => cb(toList(r.workouts)));
      listeners.presence.forEach(cb => cb(clone(r.presence || {})));
    });
  }
  if (channel) channel.onmessage = e => { if (e.data === code) emit(); };

  function watch(kind, cb) {
    listeners[kind].push(cb);
    emit();
    return () => { listeners[kind] = listeners[kind].filter(f => f !== cb); };
  }
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    parts.slice(0, -1).forEach(p => { if (typeof o[p] !== 'object' || !o[p]) o[p] = {}; o = o[p]; });
    o[parts[parts.length - 1]] = value;
  }

  return {
    configured: true,
    kind: 'sample',
    ready: async () => {},
    now: () => Date.now(),
    calibrate: async () => null,

    roomExists: async c => !!load()[c],
    async createRoom(c, data) {
      const all = load();
      all[c] = { room: clone(data), videos: {}, workouts: {}, live: null, presence: {} };
      localStorage.setItem(KEY, JSON.stringify(all));
    },
    open(c) { code = c; },
    async moveRoom(newCode) {
      const all = load();
      if (all[newCode]) throw new Error('taken');
      const old = code;
      all[newCode] = all[old];
      delete all[old];
      localStorage.setItem(KEY, JSON.stringify(all));
      code = newCode;
      if (channel) channel.postMessage(old); // other tabs on the old code notice it's gone
    },

    watchRoom: cb => watch('room', cb),
    updateRoom: async patch => save(r => Object.entries(patch).forEach(([k, v]) => setPath(r.room, k, v))),
    removeRoomField: async path => save(r => {
      const parts = path.split('.');
      let o = r.room;
      parts.slice(0, -1).forEach(p => { o = o && o[p]; });
      if (o) delete o[parts[parts.length - 1]];
    }),

    watchVideos: cb => watch('videos', cb),
    async addVideos(videos) {
      const ids = videos.map(() => newId());
      save(r => videos.forEach((v, i) => { r.videos[ids[i]] = { ...clone(v), t: Date.now() }; }));
      return ids;
    },
    updateVideo: async (id, patch) => save(r => { if (r.videos[id]) Object.assign(r.videos[id], clone(patch)); }),
    deleteVideo: async id => save(r => { delete r.videos[id]; }),

    watchLive: cb => watch('live', cb),
    async changeLive(fn) {
      const cur = (roomData() || {}).live || {};
      const patch = fn(clone(cur));
      if (!patch) return false;
      save(r => { r.live = { ...(r.live || {}), ...clone(patch), rev: (cur.rev || 0) + 1 }; });
      return true;
    },

    watchWorkouts: cb => watch('workouts', cb),
    addWorkout: async w => save(r => { r.workouts[newId()] = { ...clone(w), t: Date.now() }; }),
    deleteWorkout: async id => save(r => { delete r.workouts[id]; }),

    heartbeat: async me => {
      const all = load();
      if (!all[code]) return;
      all[code].presence = { ...(all[code].presence || {}), [me]: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
      emit();
      if (channel) channel.postMessage(code);
    },
    watchPresence: cb => watch('presence', cb),
  };
})();
