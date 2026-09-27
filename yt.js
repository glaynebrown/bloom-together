/* YouTube helpers: loading the IFrame API, reading links, and a small hidden
   player that looks up titles, lengths and playlists (so no API key is needed). */
const YT_ = (() => {
  const ready = new Promise(resolve => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });

  // Accepts a video or playlist link (or a bare video id).
  function parseLink(text) {
    const t = (text || '').trim();
    if (/^[\w-]{11}$/.test(t)) return { video: t };
    let url;
    try { url = new URL(t.startsWith('http') ? t : `https://${t}`); } catch (e) { return null; }
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    const list = url.searchParams.get('list');
    let video = null;
    if (host === 'youtu.be') video = url.pathname.slice(1, 12);
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      video = url.searchParams.get('v')
        || (url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1]
        || null;
    } else return null;
    if (video && !/^[\w-]{11}$/.test(video)) video = null;
    // A playlist page link (no specific video) means "import the playlist".
    if (list && !video) return { playlist: list };
    if (video) return { video, playlist: list || null };
    return null;
  }

  const thumb = yt => `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`;

  // Guess workout parts from a title ("15 MIN TONED ARMS WORKOUT" -> arms).
  // The starting parts know their usual words; any part you add (Glutes,
  // Shoulders...) matches on its own name.
  const RULES = {
    stretch: /stretch|warm[\s-]?up|mobility|cool[\s-]?down|yoga|flexib/,
    arms: /\barms?\b|upper body|shoulder|bicep|tricep|\bback\b|chest/,
    legs: /\blegs?\b|booty|glute|thigh|lower body|\bbutt\b|squat/,
    abs: /\babs?\b|\bcore\b|oblique|six[\s-]?pack/,
    fullbody: /full[\s-]?body|total[\s-]?body|whole[\s-]?body/,
  };
  function guessCats(title, parts) {
    const t = (title || '').toLowerCase();
    return parts.filter(p => {
      if (RULES[p.key] && RULES[p.key].test(t)) return true;
      return [p.short, p.label].some(name => {
        const stem = (name || '').toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/e?s$/, '');
        return stem.length >= 3 && new RegExp(`\\b${stem}`).test(t);
      });
    }).map(p => p.key);
  }

  /* ---- hidden lookup player ---- */
  let metaPlayer = null;
  let metaState = -1;
  let metaError = null;
  let queue = Promise.resolve();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getMeta() {
    if (metaPlayer) return metaPlayer;
    const YT = await ready;
    await new Promise(resolve => {
      metaPlayer = new YT.Player('meta-player', {
        width: 200, height: 113,
        playerVars: { controls: 0, playsinline: 1, mute: 1, origin: location.origin },
        events: {
          onReady: () => { metaPlayer.mute(); resolve(); },
          onStateChange: e => { metaState = e.data; },
          onError: e => { metaError = e.data; },
        },
      });
    });
    return metaPlayer;
  }

  // One lookup at a time, since there's one hidden player.
  const serial = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

  async function oembedTitle(yt) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`);
      if (r.ok) return (await r.json()).title || '';
    } catch (e) {}
    return '';
  }

  // { title, seconds, noEmbed } for one video.
  const info = yt => serial(async () => {
    const p = await getMeta();
    metaError = null;
    metaState = -1;
    p.cueVideoById(yt);
    let started = false;
    const t0 = Date.now();
    let title = '', seconds = 0;
    while (Date.now() - t0 < 9000) {
      await sleep(200);
      if (metaError) break;
      const data = p.getVideoData ? p.getVideoData() : {};
      if (data && data.video_id === yt && data.title) title = data.title;
      seconds = Math.round(p.getDuration() || 0);
      if (title && seconds) break;
      // Some videos only report their length once playing (muted, hidden).
      if (!started && Date.now() - t0 > 2000) { started = true; p.mute(); p.playVideo(); }
    }
    if (started) p.pauseVideo();
    if (!title) title = await oembedTitle(yt);
    const noEmbed = metaError === 101 || metaError === 150;
    return { title: title || 'Untitled video', seconds, noEmbed, missing: metaError === 100 };
  });

  // Video ids in a public or unlisted playlist.
  const playlist = listId => serial(async () => {
    const p = await getMeta();
    p.cuePlaylist({ listType: 'playlist', list: listId });
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await sleep(300);
      const ids = p.getPlaylist && p.getPlaylist();
      if (ids && ids.length) return ids;
    }
    return [];
  });

  return { ready, parseLink, thumb, guessCats, info, playlist };
})();
