/* =========================================================================
 * AMBIENT MANN — live-spiller (Icecast / AzuraCast)
 * Kobler <audio> mot Ambient Manns Traktor-strøm. Henter «now playing»
 * (låt / LIVE-status / lyttertall) fra AzuraCast om det er satt opp, og
 * faller pent tilbake til en «offline»-tilstand hvis serveren ikke er oppe.
 * Dette er IKKE en web-radio – strømmen spiller kun når Ambient Mann er live.
 * ========================================================================= */
window.Player = (function () {
  const audio = new Audio();
  audio.preload = 'none';
  // Ikke sett crossOrigin – da krever nettleseren CORS-headere fra strøm-
  // serveren, og mange Icecast-strømmer blokkeres da.

  let wantPlaying = false;
  let reconnectTimer = null;
  let backoff = 1000;
  let state = { live: false, title: '', by: '', listeners: 0 };

  const els = {};

  // Aktiv strøm-URL: eierens overstyring (Content) → config.
  function streamUrl() {
    const c = (window.Content && Content.get('stream')) || null;
    if (c && c.url) return c.url;
    return (window.AM_CONFIG && AM_CONFIG.streamUrl) || '';
  }
  function nowPlayingUrl() {
    const c = (window.Content && Content.get('stream')) || null;
    if (c && c.nowPlayingUrl) return c.nowPlayingUrl;
    return (window.AM_CONFIG && AM_CONFIG.nowPlayingUrl) || '';
  }

  function bind() {
    els.play = document.getElementById('pb-play');
    els.now = document.getElementById('pb-now');
    els.by = document.getElementById('pb-by');
    els.vol = document.getElementById('pb-vol');
    els.heroPlay = document.getElementById('hero-play');
    els.liveKicker = document.getElementById('live-kicker');
    els.liveTitle = document.getElementById('live-title');
    els.liveSub = document.getElementById('live-sub');
    els.liveListeners = document.getElementById('live-listeners');
    els.liveBadge = document.getElementById('live-badge');

    els.play && els.play.addEventListener('click', toggle);
    els.heroPlay && els.heroPlay.addEventListener('click', toggle);
    if (els.vol) {
      audio.volume = 0.85;
      els.vol.value = 85;
      els.vol.addEventListener('input', () => { audio.volume = els.vol.value / 100; });
    }
    audio.addEventListener('playing', () => { backoff = 1000; clearTimeout(reconnectTimer); render(); });
    audio.addEventListener('pause', () => { render(); if (wantPlaying) scheduleReconnect(); });
    audio.addEventListener('error', () => { render(); scheduleReconnect(); });
    audio.addEventListener('ended', () => scheduleReconnect());
  }

  function toggle() {
    if (!streamUrl()) {
      UI.toast('Live er ikke koblet opp ennå. Ambient Mann er offline akkurat nå.');
      return;
    }
    if (wantPlaying) { wantPlaying = false; clearTimeout(reconnectTimer); audio.pause(); }
    else { wantPlaying = true; connect(); }
    render();
  }

  function connect() {
    clearTimeout(reconnectTimer);
    const url = streamUrl();
    if (!url) return;
    if (audio.src !== url) audio.src = url;
    audio.play().catch(() => scheduleReconnect());
  }

  // Hold sendingen i gang: faller strømmen og eieren fortsatt vil lytte,
  // koble til på nytt med økende venting (maks 15 s).
  function scheduleReconnect() {
    if (!wantPlaying) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (!wantPlaying) return;
      try { audio.load(); } catch (_) {}
      audio.src = streamUrl();
      audio.play().catch(() => scheduleReconnect());
    }, backoff);
    backoff = Math.min(backoff * 2, 15000);
  }

  async function poll() {
    const np = nowPlayingUrl();
    if (!np) { render(); return; }
    try {
      const r = await fetch(np, { cache: 'no-store' });
      const d = await r.json();
      const song = d.now_playing || {};
      const live = !!(d.live && d.live.is_live);
      state = {
        live: live,
        title: (song.song && (song.song.title || song.song.text)) || '',
        by: live ? (d.live.streamer_name || 'Ambient Mann') : ((song.song && song.song.artist) || ''),
        listeners: (d.listeners && d.listeners.current) || 0,
      };
    } catch (_) { /* behold forrige tilstand */ }
    render();
  }

  function render() {
    const hasStream = !!streamUrl();
    // Player-bar
    if (els.play) els.play.textContent = wantPlaying ? '⏸' : '▶';
    if (els.now) els.now.textContent = state.live ? (state.by || 'Ambient Mann') : (hasStream ? 'Ambient Mann' : 'Offline');
    if (els.by) {
      els.by.innerHTML = state.live
        ? '<span class="pb-live"><span class="dot"></span>LIVE</span> ' + UI.esc(state.title || 'Live fra Traktor')
        : (hasStream ? '<span class="pb-ai">✦</span> Klar til sending' : '<span class="pb-ai">✦</span> Ikke live nå');
    }
    // Live nå-boks
    if (els.liveBadge) els.liveBadge.style.display = state.live ? '' : 'none';
    if (els.liveKicker) els.liveKicker.textContent = state.live ? 'LIVE NÅ' : (hasStream ? 'STRØM KLAR' : 'OFFLINE');
    if (els.liveTitle) els.liveTitle.textContent = state.live ? (state.by || 'Ambient Mann') : 'Ambient Mann';
    if (els.liveSub) els.liveSub.textContent = state.live
      ? (state.title || 'Live direkte fra Traktor')
      : (hasStream ? 'Trykk på play når Ambient Mann går live.' : 'Ambient Mann er ikke live akkurat nå – se sendeplanen under.');
    if (els.liveListeners) els.liveListeners.textContent = state.listeners;
    updateLiveBg();
  }

  // Bilde eller bevegelig mp4-video i bakgrunnen mens Ambient Mann er live.
  function updateLiveBg() {
    const box = document.getElementById('live-bg');
    if (!box) return;
    const vid = document.getElementById('live-bg-video');
    const bg = (window.Content && Content.get('liveBg')) || {};
    const active = !!(state.live && bg && bg.url);
    box.classList.toggle('active', active);
    if (active && bg.type === 'video') {
      box.style.backgroundImage = '';
      if (vid) { if (vid.getAttribute('src') !== bg.url) vid.setAttribute('src', bg.url); vid.style.display = ''; vid.play().catch(() => {}); }
    } else if (active) {
      if (vid) { vid.pause(); vid.style.display = 'none'; }
      box.style.backgroundImage = 'url("' + bg.url + '")';
    } else {
      if (vid) { vid.pause(); vid.style.display = 'none'; }
      box.style.backgroundImage = '';
    }
  }

  function isLive() { return !!state.live; }

  function init() {
    bind();
    render();
    poll();
    setInterval(poll, (window.AM_CONFIG && AM_CONFIG.nowPlayingInterval) || 15000);
    setInterval(() => { if (wantPlaying && audio.paused) scheduleReconnect(); }, 20000);
  }

  return { init, poll, render, isLive, streamUrl };
})();
