/* =========================================================================
 * AMBIENT MANN — musikk publikum kan velge og høre på
 * Ambient Mann laster opp WAV/MP3 (1–2 t) MED eget cover-bilde når han er
 * logget inn. Lytterne får en ordentlig spiller: play/pause + søkefelt
 * (spoling) + tid, og velger selv spor fra spillelista.
 * ========================================================================= */
window.Tracks = (function () {
  const audio = new Audio();
  audio.preload = 'metadata';
  let current = -1;
  let seeking = false;

  function list() { return ((window.Content && Content.get('tracks')) || []).slice(); }

  function fmtSize(b) {
    if (!b) return '';
    const mb = b / 1048576;
    return mb >= 1 ? mb.toFixed(0) + ' MB' : (b / 1024).toFixed(0) + ' KB';
  }
  function fmtTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---- hovedspiller (cover + play + søkefelt) -----------------------------
  const P = {};
  function bindPlayer() {
    P.cover = document.getElementById('tp-cover');
    P.title = document.getElementById('tp-title');
    P.play = document.getElementById('tp-play');
    P.seek = document.getElementById('tp-seek');
    P.time = document.getElementById('tp-time');
    if (P.play) P.play.addEventListener('click', () => { if (current < 0) play(0); else toggle(); });
    if (P.seek) {
      P.seek.addEventListener('input', () => { seeking = true; if (P.time) P.time.textContent = fmtTime(audio.duration * (P.seek.value / 100)) + ' / ' + fmtTime(audio.duration); });
      P.seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = audio.duration * (P.seek.value / 100); seeking = false; });
    }
  }
  function paintPlayer() {
    const t = list()[current];
    if (P.title) P.title.textContent = t ? (t.title || 'Spor') : 'Velg et spor';
    if (P.cover) {
      if (t && t.coverUrl) { P.cover.style.backgroundImage = 'url("' + t.coverUrl + '")'; P.cover.classList.remove('empty'); }
      else { P.cover.style.backgroundImage = ''; P.cover.classList.add('empty'); }
    }
    if (P.play) P.play.textContent = (!audio.paused && current >= 0) ? '⏸' : '▶';
  }
  audio.addEventListener('timeupdate', () => {
    if (P.seek && audio.duration && !seeking) P.seek.value = (audio.currentTime / audio.duration) * 100;
    if (P.time && !seeking) P.time.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
  });
  audio.addEventListener('play', () => { paintPlayer(); renderList(); });
  audio.addEventListener('pause', () => { paintPlayer(); renderList(); });
  audio.addEventListener('ended', next);

  function toggle() { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
  function play(i) {
    const tr = list();
    if (!tr[i] || !tr[i].url) return;
    if (i === current) { toggle(); return; }
    audio.src = tr[i].url; current = i;
    audio.play().catch(() => UI.toast('Kunne ikke spille av sporet.'));
    paintPlayer(); renderList();
  }
  function next() { const n = current + 1; if (n < list().length) play(n); else { current = -1; paintPlayer(); renderList(); } }

  // ---- spilleliste --------------------------------------------------------
  function renderList() {
    const wrap = document.getElementById('tracks-list');
    if (!wrap) return;
    const tr = list();
    if (!tr.length) { wrap.innerHTML = '<p class="muted">Ingen opplastet musikk ennå.</p>'; }
    else {
      wrap.innerHTML = tr.map((t, i) => {
        const playing = i === current && !audio.paused;
        const del = Owner.isOwner()
          ? '<button class="btn btn-tiny owner-only" data-rm="' + i + '">Slett</button>' : '';
        const cov = t.coverUrl ? '<span class="track-cover" style="background-image:url(\'' + UI.esc(t.coverUrl) + '\')"></span>'
                               : '<span class="track-cover empty">♪</span>';
        return '<div class="track-row' + (i === current ? ' playing' : '') + '" data-play="' + i + '">' +
          cov +
          '<button class="track-play" data-play="' + i + '">' + (playing ? '⏸' : '▶') + '</button>' +
          '<div class="track-meta"><div class="track-title">' + UI.esc(t.title || ('Spor ' + (i + 1))) + '</div>' +
          '<div class="track-sub">' + UI.esc(fmtSize(t.size)) + '</div></div>' + del +
        '</div>';
      }).join('');
    }
    UI.$all('[data-play]', wrap).forEach(el =>
      el.addEventListener('click', () => play(parseInt(el.getAttribute('data-play'), 10))));
    UI.$all('[data-rm]', wrap).forEach(b =>
      b.addEventListener('click', (ev) => { ev.stopPropagation(); del(parseInt(b.getAttribute('data-rm'), 10)); }));
    Owner.applyVisibility();
  }

  function render() { paintPlayer(); renderList(); }

  // ---- eier: opplasting (lyd + eget cover-bilde) --------------------------
  async function doUpload() {
    const fileEl = document.getElementById('track-file');
    const coverEl = document.getElementById('track-cover');
    const titleEl = document.getElementById('track-title');
    const status = document.getElementById('track-upstatus');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!file) { UI.toast('Velg en lyd-fil (WAV/MP3).'); return; }
    if (!SC_Storage.isConfigured()) { UI.toast('Lyd-lagring er ikke satt opp ennå (mangler Supabase i config).'); return; }
    if (status) status.textContent = 'Laster opp lyd … (store filer kan ta litt tid)';
    try {
      const up = await SC_Storage.upload(file, {
        prefix: 'tracks',
        onProgress: p => { if (status) status.textContent = 'Laster opp lyd … ' + Math.round(p * 100) + '%'; },
      });
      let coverUrl = '', coverPath = '';
      const coverFile = coverEl && coverEl.files && coverEl.files[0];
      if (coverFile) {
        if (status) status.textContent = 'Laster opp cover-bilde …';
        const cu = await SC_Storage.upload(coverFile, { prefix: 'covers' });
        coverUrl = cu.url; coverPath = cu.path;
      }
      const meta = {
        id: 't_' + Date.now().toString(36),
        title: (titleEl && titleEl.value.trim()) || file.name.replace(/\.[a-z0-9]+$/i, ''),
        url: up.url, path: up.path, size: up.size, coverUrl, coverPath,
      };
      const r = await Owner.authFetch('/api/site?action=track-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
      });
      if (!r.ok) UI.toast('Fikk lastet opp, men klarte ikke lagre i lista.');
      const arr = list(); arr.push(meta); await Content.set('tracks', arr);
      if (status) status.textContent = 'Lagt til!';
      if (fileEl) fileEl.value = ''; if (coverEl) coverEl.value = ''; if (titleEl) titleEl.value = '';
      render();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (status) status.textContent = 'Feil: ' + msg;
      UI.toast(msg === 'not-configured' ? 'Lyd-lagring ikke satt opp.' : ('Opplasting feilet: ' + msg));
    }
  }

  async function del(i) {
    const t = list()[i]; if (!t) return;
    try {
      await Owner.authFetch('/api/site?action=track-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: t.path, coverPath: t.coverPath || '' }),
      });
    } catch (_) {}
    const arr = list(); arr.splice(i, 1); await Content.set('tracks', arr);
    if (current === i) { audio.pause(); current = -1; }
    render();
  }

  function bind() {
    bindPlayer();
    const btn = document.getElementById('track-upload');
    if (btn) btn.addEventListener('click', doUpload);
  }

  return { render, bind, play };
})();
