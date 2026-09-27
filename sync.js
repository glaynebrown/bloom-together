/* Keeping two players in step.

   The shared "live" doc (rooms/{code}/live/now) says what should be playing:
     { queue: [{ vid, yt, title, seconds, cats }], index,
       mode: 'idle' | 'ready' | 'playing' | 'paused' | 'finished',
       position,  // seconds into the video at startAt (or where it's paused)
       startAt,   // server-clock ms when playback (re)starts
       rest,      // this video is next up after the last one ended
       logged, by, action, rev }

   Nobody sends "play now". Pressing play writes a start time ~2.5s in the
   future, and each device starts itself at that moment. While playing, each
   device compares where its video is with where it should be and nudges
   itself back when it drifts more than ~0.4s (after buffering, a hiccup...).
   Rest between videos is just a start time further in the future. */
const Sync = (() => {
  const LEAD = 2500;       // ms between pressing play and both videos starting
  const DRIFT = 0.25;      // seconds off before we correct
  const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

  let store, me, getSettings, onChange = () => {};
  let player = null, playerReady = false;
  let live = null;
  let loadedYt = null;
  let startTimer = null;
  let lastSeek = 0, lastPlayTry = 0, playTries = 0;
  let seekLead = 0.2;      // a seek takes a moment to land; learned per device
  let checkLanding = false;
  let needTap = false;
  let primed = false, priming = false;
  let endedRev = null;
  let appliedRev;
  let lastState = S.UNSTARTED;

  const now = () => store.now();
  const item = (s = live) => s && s.queue && s.queue[s.index];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cur = () => (playerReady && player.getCurrentTime ? player.getCurrentTime() || 0 : 0);
  const duration = () => {
    const it = item();
    const d = playerReady && loadedYt === (it && it.yt) ? player.getDuration() : 0;
    return d || (it && it.seconds) || 0;
  };
  // Where the video should be right now, per the shared doc.
  function target(s = live) {
    if (!s) return 0;
    if (s.mode !== 'playing') return s.position || 0;
    return (s.position || 0) + Math.max(0, now() - s.startAt) / 1000;
  }

  function setNeedTap(v) {
    if (needTap === v) return;
    needTap = v;
    onChange();
  }

  function init(opts) {
    ({ store, me, getSettings } = opts);
    onChange = opts.onChange || onChange;
    YT_.ready.then(YT => {
      player = new YT.Player('player', {
        width: '100%', height: '100%',
        playerVars: {
          controls: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3,
          disablekb: 1, fs: 0, origin: location.origin,
        },
        events: {
          onReady: () => { playerReady = true; resync(); },
          onStateChange: e => {
            lastState = e.data;
            // It played, so this browser allows it: no need to ask for a tap.
            if (e.data === S.PLAYING) primed = true;
            if (priming && e.data === S.PLAYING) {
              priming = false;
              if (!live || live.mode !== 'playing') { player.pauseVideo(); resync(); }
            }
            if (e.data === S.ENDED) ended();
            onChange();
          },
          onError: e => {
            console.warn('player error', e.data);
            // A bad request (2) or HTML5 hiccup (5): reload the video and try again.
            if (e.data === 2 || e.data === 5) { loadedYt = null; setTimeout(resync, 800); }
          },
        },
      });
    });
    setInterval(watchdog, 500);
  }

  function ensureVideo(yt, pos) {
    if (loadedYt === yt) return false;
    loadedYt = yt;
    player.cueVideoById({ videoId: yt, startSeconds: pos || 0 });
    lastSeek = Date.now();
    return true;
  }

  // Seek without starting playback on a cued video (seekTo would start it).
  function holdAt(pos) {
    const st = player.getPlayerState();
    if (st === S.CUED || st === S.UNSTARTED || st === S.ENDED) {
      if (Math.abs(cur() - pos) > 0.5) player.cueVideoById({ videoId: loadedYt, startSeconds: pos });
    } else {
      if (st === S.PLAYING || st === S.BUFFERING) player.pauseVideo();
      if (Math.abs(cur() - pos) > 0.5) player.seekTo(pos, true);
    }
  }

  function startNow() {
    const tgt = target();
    const st = player.getPlayerState();
    if (st === S.UNSTARTED || st === S.CUED || st === S.ENDED) {
      // Not started yet: load it straight at the right spot (and play).
      player.loadVideoById({ videoId: loadedYt, startSeconds: tgt });
      lastSeek = Date.now();
    } else {
      if (Math.abs(cur() - tgt) > 0.3) { player.seekTo(tgt, true); lastSeek = Date.now(); }
      player.playVideo();
    }
    lastPlayTry = Date.now();
  }

  // Called with every snapshot of the live doc; only acts when it changed.
  function apply(s) {
    live = s;
    const rev = s ? s.rev : null;
    if (!playerReady || rev === appliedRev) return;
    appliedRev = rev;
    clearTimeout(startTimer);
    const it = item(s);
    if (!s || !it || s.mode === 'idle' || s.mode === 'finished') {
      if (lastState === S.PLAYING || lastState === S.BUFFERING) player.pauseVideo();
      setNeedTap(false);
      onChange();
      return;
    }
    ensureVideo(it.yt, s.mode === 'playing' && now() >= s.startAt ? target(s) : s.position);
    if (s.mode === 'playing') {
      const wait = s.startAt - now();
      if (wait > 0) {
        holdAt(s.position || 0);
        startTimer = setTimeout(startNow, wait);
      } else startNow();
      playTries = 0;
    } else {
      holdAt(s.position || 0);
      setNeedTap(false);
    }
    onChange();
  }

  function resync() { appliedRev = undefined; apply(live); }

  // Twice a second: fix drift, notice the end, retry a blocked start.
  function watchdog() {
    if (!playerReady || !live || live.mode !== 'playing' || now() < live.startAt) return;
    const it = item();
    if (!it || loadedYt !== it.yt) return;
    const st = player.getPlayerState();
    const tgt = target();
    const dur = duration();
    if ((dur && tgt >= dur - 0.25) || st === S.ENDED) { ended(); return; }
    if (st === S.PLAYING) {
      playTries = 0;
      setNeedTap(false);
      const drift = cur() - tgt;
      if (Date.now() - lastSeek > 2500) {
        // See where our last correction landed and aim better next time.
        if (checkLanding && Math.abs(drift) < 1.5) seekLead = clamp(seekLead - drift * 0.8, 0, 1.2);
        checkLanding = false;
        if (Math.abs(drift) > DRIFT) {
          player.seekTo(tgt + seekLead, true);
          lastSeek = Date.now();
          checkLanding = true;
        }
      }
    } else if (st !== S.BUFFERING && Date.now() - lastPlayTry > 1500) {
      // The browser may block starting a video without a tap.
      playTries++;
      if (playTries >= 2) setNeedTap(true);
      startNow();
    }
  }

  // The first device to notice the video ended moves everyone along; the
  // rev check means both noticing at once only advances once.
  function ended() {
    if (!live || live.mode !== 'playing' || endedRev === live.rev) return;
    endedRev = live.rev;
    const seen = live;
    store.changeLive(c => {
      if (c.rev !== seen.rev || c.mode !== 'playing' || c.index !== seen.index) return null;
      if (c.index >= c.queue.length - 1) return { mode: 'finished', rest: false, by: me, action: 'finish' };
      const wait = Number((getSettings() || {}).autoNext) || 0;
      return wait > 0
        ? { index: c.index + 1, mode: 'playing', position: 0, startAt: now() + wait * 1000, rest: true, by: me, action: 'next' }
        : { index: c.index + 1, mode: 'ready', position: 0, rest: true, by: me, action: 'next' };
    }).catch(e => { console.error(e); endedRev = null; });
  }

  // A tap on this device: lets the browser play sound from now on. If a
  // video should be playing, start it right in this tap.
  function tapIn() {
    primed = true;
    setNeedTap(false);
    if (!playerReady) return;
    player.unMute();
    if (live && live.mode === 'playing' && now() >= live.startAt) {
      startNow();
    } else if (lastState !== S.PLAYING) {
      priming = true;          // play for an instant, then back to paused
      player.playVideo();
      setTimeout(() => { if (priming) { priming = false; resync(); } }, 1500);
    }
    onChange();
  }

  /* ---- commands (either sister can press any of these) ---- */
  const change = fn => store.changeLive(fn).catch(e => { console.error(e); App.toast('That didn’t go through — try again'); });
  const stamp = (action, extra) => ({ by: me, action, ...extra });

  const cmd = {
    start: queue => change(() => stamp('start', { queue, index: 0, mode: 'ready', position: 0, rest: false, logged: false, startAt: 0 })),
    play: () => change(c => (c.mode === 'ready' || c.mode === 'paused')
      ? stamp('play', { mode: 'playing', startAt: now() + LEAD }) : null),
    pause: () => change(c => c.mode === 'playing'
      ? stamp('pause', { mode: now() < c.startAt && c.rest ? 'ready' : 'paused', position: target(c) }) : null),
    seekBy: secs => change(c => {
      if (!['playing', 'paused', 'ready'].includes(c.mode)) return null;
      const d = duration() || 1e9;
      const position = clamp(target(c) + secs, 0, Math.max(0, d - 1));
      return c.mode === 'playing'
        ? stamp('seek', { position, startAt: now() + 1200, rest: false })
        : stamp('seek', { position });
    }),
    go: index => change(c => {
      if (!c.queue || index < 0 || index >= c.queue.length) return null;
      const playing = c.mode === 'playing';
      return stamp('go', { index, position: 0, rest: false, mode: playing ? 'playing' : 'ready', startAt: playing ? now() + 3000 : 0 });
    }),
    skipRest: () => change(c => {
      if (c.mode === 'ready') return stamp('play', { mode: 'playing', startAt: now() + LEAD });
      if (c.mode === 'playing' && c.startAt - now() > LEAD) return stamp('skip', { startAt: now() + LEAD });
      return null;
    }),
    moreRest: secs => change(c => (c.mode === 'playing' && c.startAt > now())
      ? stamp('rest', { startAt: c.startAt + secs * 1000 }) : null),
    end: () => change(() => stamp('end', { mode: 'idle', rest: false })),
  };

  function status() {
    const s = live;
    const countdown = s && s.mode === 'playing' ? Math.max(0, (s.startAt - now()) / 1000) : 0;
    return {
      mode: s ? s.mode : 'idle',
      pos: s && s.mode === 'playing' && countdown === 0 ? Math.max(target(), 0) : (s ? s.position || 0 : 0),
      dur: duration(),
      countdown,
      rest: !!(s && s.rest),
      needTap,
      primed,
      playerReady,
      actual: cur(),      // where this player really is (for checking sync)
      target: target(),
      state: playerReady ? player.getPlayerState() : null,
    };
  }

  return { init, apply, tapIn, status, cmd, target };
})();
