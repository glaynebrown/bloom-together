/* All data access lives here, so the rest of the app deals in plain objects.

   Firestore layout (everything hangs off one room):
     rooms/{code}                 { names: { p1: 'Bella', p2: 'Izzy' },
                                    settings: { autoNext: 0|30|45|60, solo: false },
                                    plans: { 'YYYY-MM-DD' (a Sunday): [0..6 weekdays] },
                                    mix: last "build a mix" choices,
                                    cats: workout parts, goals: { wYYYYMMDD: n },
                                    favorites: { id: { name, note, videos: [queue items], t } },
                                    created }
     rooms/{code}/videos/{id}     { yt, title, seconds, cats: ['stretch'|'arms'|'legs'|'abs'],
                                    noEmbed?, t }
     rooms/{code}/live/now        what's playing right now (see sync.js)
     rooms/{code}/workouts/{id}   { day: 'YYYY-MM-DD', videos: [{ vid, yt, title, seconds }],
                                    seconds, solo?, by, t }
     rooms/{code}/presence/{p1|p2} { name, seen }   heartbeat every 15s; seen: null when away

   Devices sign in anonymously; the room code is the key. When
   firebase-config.js hasn't been filled in, demo.js stands in (sample mode). */

const Store = (() => {
  const configured = typeof firebaseConfig !== 'undefined' && !/PASTE/.test(firebaseConfig.apiKey);
  if (!configured) return { configured: false };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let code = null;
  let offset = 0; // server clock minus this device's clock, in ms
  const room = () => db.collection('rooms').doc(code);
  const sub = name => room().collection(name);
  const liveDoc = () => sub('live').doc('now');
  const withId = d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });
  const list = cb => snap => cb(snap.docs.map(withId));
  // Anonymous sign-ins older than 30 days are deleted by Firebase. When that
  // happens this device is signed out; sign straight back in (a new anonymous
  // sign-in, same code, same data) and reload so the live updates reconnect.
  let hadUser = false;
  let signingIn = null;
  const signIn = () => signingIn || (signingIn = auth.signInAnonymously().finally(() => { signingIn = null; }));
  const firstState = new Promise(res => {
    auth.onAuthStateChanged(u => {
      res();
      if (u) { hadUser = true; return; }
      signIn().then(() => { if (hadUser) location.reload(); }).catch(e => console.warn('sign-in failed', e));
    });
  });
  const warn = what => e => {
    console.error(what, e);
    // A listener refused because the sign-in lapsed: try once to recover.
    if (e.code === 'permission-denied' || e.code === 'unauthenticated') {
      const last = Number(sessionStorage.getItem('bt-reauth') || 0);
      if (Date.now() - last > 60000) {
        sessionStorage.setItem('bt-reauth', Date.now());
        auth.signOut().catch(() => {}); // onAuthStateChanged signs back in and reloads
      }
    }
  };

  async function ready() {
    await firstState;
    if (!auth.currentUser) await signIn();
  }

  // Both devices need to agree on "now" to start videos at the same moment.
  // Each sample writes a server timestamp and times the round trip; the
  // quickest round trip gives the most accurate estimate.
  async function calibrate(me) {
    const ref = sub('presence').doc(`clock-${me}`);
    let best = null;
    for (let i = 0; i < 4; i++) {
      try {
        const t0 = Date.now();
        await ref.set({ ping: FV.serverTimestamp() });
        const t1 = Date.now();
        const snap = await ref.get({ source: 'server' });
        const server = snap.get('ping').toMillis();
        const rtt = t1 - t0;
        if (!best || rtt < best.rtt) best = { rtt, offset: server - (t0 + t1) / 2 };
      } catch (e) { console.warn('clock sample failed', e); }
    }
    if (best) offset = best.offset;
    return best;
  }

  return {
    configured: true,
    kind: 'firebase',
    ready,
    now: () => Date.now() + offset,
    calibrate,

    async roomExists(c) {
      await ready();
      return (await db.collection('rooms').doc(c).get()).exists;
    },
    async createRoom(c, data) {
      await ready();
      await db.collection('rooms').doc(c).set({ ...data, created: FV.serverTimestamp() });
    },
    open(c) { code = c; },
    // Move everything to a new code: copy the room and its workouts, videos
    // and live state, then delete the old copy. Other devices get signed out.
    async moveRoom(newCode) {
      const oldRef = room();
      const newRef = db.collection('rooms').doc(newCode);
      if ((await newRef.get({ source: 'server' })).exists) throw new Error('taken');
      const data = (await oldRef.get({ source: 'server' })).data();
      const subs = ['videos', 'workouts', 'live', 'presence'];
      const snaps = await Promise.all(subs.map(n => oldRef.collection(n).get({ source: 'server' })));
      const run = async ops => {
        for (let i = 0; i < ops.length; i += 400) {
          const batch = db.batch();
          ops.slice(i, i + 400).forEach(op => op(batch));
          await batch.commit();
        }
      };
      await newRef.set(data); // first, so the new room exists for its subcollections
      await run(snaps.slice(0, 3).flatMap((snap, i) => snap.docs.map(d => b => b.set(newRef.collection(subs[i]).doc(d.id), d.data()))));
      await run(snaps.flatMap(snap => snap.docs.map(d => b => b.delete(d.ref))));
      await oldRef.delete();
      code = newCode;
    },

    watchRoom: cb => room().onSnapshot(d => cb(d.exists ? d.data() : null), warn('room')),
    // patch keys may be dotted paths, e.g. { 'names.p1': 'Gabriella' }
    updateRoom: patch => room().update(patch),
    removeRoomField: path => room().update({ [path]: FV.delete() }),

    watchVideos: cb => sub('videos').onSnapshot(list(cb), warn('videos')),
    async addVideos(videos) {
      const batch = db.batch();
      const ids = videos.map(v => {
        const ref = sub('videos').doc();
        batch.set(ref, { ...v, t: Date.now() });
        return ref.id;
      });
      await batch.commit();
      return ids;
    },
    updateVideo: (id, patch) => sub('videos').doc(id).update(patch),
    deleteVideo: id => sub('videos').doc(id).delete(),

    watchLive: cb => liveDoc().onSnapshot(d => cb(d.exists ? d.data() : null), warn('live')),
    // fn(current) returns the fields to change, or null to leave it alone.
    // Runs as a transaction so two taps at once can't trample each other.
    changeLive: fn => db.runTransaction(async tx => {
      const snap = await tx.get(liveDoc());
      const cur = snap.exists ? snap.data() : {};
      const patch = fn(cur);
      if (!patch) return false;
      tx.set(liveDoc(), { ...patch, rev: (cur.rev || 0) + 1 }, { merge: true });
      return true;
    }),

    watchWorkouts: cb => sub('workouts').onSnapshot(list(cb), warn('workouts')),
    addWorkout: w => sub('workouts').add({ ...w, t: Date.now() }),
    deleteWorkout: id => sub('workouts').doc(id).delete(),

    heartbeat: (me, name) => sub('presence').doc(me).set({ name, seen: FV.serverTimestamp() }).catch(() => {}),
    away: me => sub('presence').doc(me).set({ seen: null }, { merge: true }).catch(() => {}),
    watchPresence: cb => sub('presence').onSnapshot(snap => {
      const out = {};
      snap.docs.forEach(d => {
        if (d.id.startsWith('clock-')) return;
        const seen = d.get('seen', { serverTimestamps: 'estimate' });
        out[d.id] = seen ? seen.toMillis() : 0;
      });
      cb(out);
    }, warn('presence')),
  };
})();
