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
    P.mute = document.getElementById('tp-mute');
    P.vol = document.getElementById('tp-vol');
    if (P.play) P.play.addEventListener('click', () => { if (current < 0) play(0); else toggle(); });
    if (P.seek) {
      P.seek.addEventListener('input', () => { seeking = true; if (P.time) P.time.textContent = fmtTime(audio.duration * (P.seek.value / 100)) + ' / ' + fmtTime(audio.duration); });
      P.seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = audio.duration * (P.seek.value / 100); seeking = false; });
    }
    // ---- volum (huskes mellom besøk) ----
    let saved = 1;
    try { const v = parseFloat(localStorage.getItem('am_vol')); if (isFinite(v)) saved = Math.min(1, Math.max(0, v)); } catch (_) {}
    audio.volume = saved;
    if (P.vol) {
      P.vol.value = Math.round(saved * 100);
      P.vol.addEventListener('input', () => {
        const v = P.vol.value / 100;
        audio.volume = v; audio.muted = false;
        try { localStorage.setItem('am_vol', String(v)); } catch (_) {}
        paintVol();
      });
    }
    if (P.mute) P.mute.addEventListener('click', () => { audio.muted = !audio.muted; paintVol(); });
    paintVol();
  }
  function paintVol() {
    if (P.mute) P.mute.textContent = (audio.muted || audio.volume === 0) ? '🔇' : (audio.volume < 0.5 ? '🔉' : '🔊');
    if (P.vol && !audio.muted) P.vol.value = Math.round(audio.volume * 100);
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
  // Teller én avspilling (fyr-og-glem, KUN eier ser tallene). Kalles når et NYTT
  // spor startes i spilleren – ikke ved pause/fortsett eller spoling.
  function recordPlay(t) {
    if (!t || !t.id) return;
    try {
      const body = JSON.stringify({ id: t.id, title: t.title || '' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/site?action=play', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/site?action=play', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  }
  function play(i) {
    const tr = list();
    if (!tr[i] || !tr[i].url) return;
    if (i === current) { toggle(); return; }
    audio.src = tr[i].url; current = i;
    audio.play().catch(() => UI.toast('Kunne ikke spille av sporet.'));
    recordPlay(tr[i]);
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
      // Vis nyeste øverst for ALLE besøkende. Nye opplastinger legges bakerst i
      // lista, så vi reverserer VISNINGSrekkefølgen. Vi beholder den EKTE indeksen
      // «i» slik at spill/rediger/slett/del treffer riktig spor.
      const order = tr.map((_, i) => i).reverse();
      wrap.innerHTML = order.map((i, k) => {
        const t = tr[i];
        const playing = i === current && !audio.paused;
        const isOwner = Owner.isOwner();
        // Eier kan flytte HVERT spor opp/ned og bestemme rekkefølgen selv –
        // den lagres i 'tracks' og gjelder for alle besøkende. ▲/▼ deaktiveres
        // øverst/nederst i visningen. «k» = plass i den viste (reverserte) lista.
        const move = isOwner
          ? '<span class="track-moves owner-only">' +
              '<button class="track-move" data-mvup="' + i + '" title="Flytt opp"' + (k === 0 ? ' disabled' : '') + ' aria-label="Flytt opp">▲</button>' +
              '<button class="track-move" data-mvdn="' + i + '" title="Flytt ned"' + (k === order.length - 1 ? ' disabled' : '') + ' aria-label="Flytt ned">▼</button>' +
            '</span>' : '';
        const edit = isOwner
          ? '<button class="btn btn-tiny owner-only" data-edit="' + i + '">Rediger</button>' : '';
        const del = isOwner
          ? '<button class="btn btn-tiny owner-only" data-rm="' + i + '">Slett</button>' : '';
        const hasLink = !!(t.id && t.url);
        const copy = hasLink ? '<button class="track-share" data-copy="' + i + '" title="Kopier lenke" aria-label="Kopier lenke">📋</button>' : '';
        const share = hasLink ? '<button class="track-share" data-share="' + i + '" title="Del sporet" aria-label="Del sporet">🔗</button>' : '';
        const cov = t.coverUrl ? '<span class="track-cover" style="background-image:url(\'' + UI.esc(t.coverUrl) + '\')"></span>'
                               : '<span class="track-cover empty">♪</span>';
        // Har sporet egen delbar side? Da åpner klikk på cover/tittel den URL-en
        // (/track/<navn>) i ny fane, hvor sporet autospiller. ▶-knappen spiller
        // fortsatt av lokalt i spilleren over. Uten egen side: klikk = lokal play.
        const rowAttr = hasLink ? ' data-open="' + UI.esc(trackUrl(t)) + '"' : ' data-play="' + i + '"';
        return '<div class="track-row' + (i === current ? ' playing' : '') + '"' + rowAttr + '>' +
          cov +
          '<button class="track-play" data-play="' + i + '" title="Spill av her" aria-label="Spill av her">' + (playing ? '⏸' : '▶') + '</button>' +
          '<div class="track-meta"><div class="track-title">' + UI.esc(t.title || ('Spor ' + (i + 1))) + '</div>' +
          '<div class="track-sub">' + UI.esc(fmtSize(t.size)) + '</div></div>' + copy + share + move + edit + del +
        '</div>';
      }).join('');
    }
    // Én felles klikk-håndtering (event-delegering) som festes bare én gang.
    // renderList() kjøres på hver play/pause, så vi må IKKE feste nye lyttere hver
    // gang (det ville doblet avspillingen). Et klikk hvor som helst på raden –
    // cover-bildet, tittelen eller ▶ – spiller av sporet én gang, med en gang.
    if (!wrap._delegated) {
      wrap._delegated = true;
      wrap.addEventListener('click', (ev) => {
        const s = ev.target.closest('[data-share]');
        if (s) { share(parseInt(s.getAttribute('data-share'), 10)); return; }
        const c = ev.target.closest('[data-copy]');
        if (c) { copyLink(parseInt(c.getAttribute('data-copy'), 10)); return; }
        const e = ev.target.closest('[data-edit]');
        if (e) { rename(parseInt(e.getAttribute('data-edit'), 10)); return; }
        const r = ev.target.closest('[data-rm]');
        if (r) { del(parseInt(r.getAttribute('data-rm'), 10)); return; }
        const mu = ev.target.closest('[data-mvup]');
        if (mu) { move(parseInt(mu.getAttribute('data-mvup'), 10), 'up'); return; }
        const md = ev.target.closest('[data-mvdn]');
        if (md) { move(parseInt(md.getAttribute('data-mvdn'), 10), 'down'); return; }
        const p = ev.target.closest('[data-play]');
        if (p) { play(parseInt(p.getAttribute('data-play'), 10)); return; }
        const o = ev.target.closest('[data-open]');
        if (o) { window.open(o.getAttribute('data-open'), '_blank', 'noopener'); }
      });
    }
    Owner.applyVisibility();
  }

  // ---- delbar egen URL per spor: /track/<tittel-slug> (egen side m/ forhåndsvisning + autoplay) ----
  // Pen URL som matcher sportittelen, f.eks. /track/all-the-way-from-heaven-017.
  function slugify(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function trackUrl(t) {
    const slug = slugify(t.title) || encodeURIComponent(t.id);
    return location.origin + '/podcast/' + slug;
  }
  async function copyToClipboard(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); return; }
    const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  function share(i) {
    const t = list()[i]; if (!t || !t.id) return;
    openShareMenu(t, i);
  }

  // Del-meny med Facebook / X / WhatsApp / Telegram / e-post + kopier (+ native del-ark på mobil).
  function openShareMenu(t, i) {
    const title = t.title || ('Spor ' + (i + 1));
    const url = trackUrl(t);
    const text = 'Hør «' + title + '» hos Ambient Mann';
    const eu = encodeURIComponent(url), et = encodeURIComponent(text);
    const targets = [
      { label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + eu },
      { label: 'X / Twitter', href: 'https://twitter.com/intent/tweet?url=' + eu + '&text=' + et },
      { label: 'WhatsApp', href: 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url) },
      { label: 'Telegram', href: 'https://t.me/share/url?url=' + eu + '&text=' + et },
      { label: 'E-post', href: 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text + '\n\n' + url) },
    ];
    const back = document.createElement('div');
    back.className = 'share-back';
    const menu = document.createElement('div');
    menu.className = 'share-menu';
    const head = document.createElement('div');
    head.className = 'share-title';
    head.textContent = 'Del «' + title + '»';
    menu.appendChild(head);

    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }

    targets.forEach(tg => {
      const a = document.createElement('a');
      a.className = 'share-item'; a.href = tg.href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = tg.label;
      a.addEventListener('click', () => close());
      menu.appendChild(a);
    });
    const cp = document.createElement('button');
    cp.className = 'share-item'; cp.textContent = '📋 Kopier lenke';
    cp.addEventListener('click', async () => { try { await copyToClipboard(url); UI.toast('Lenke kopiert!'); } catch (_) {} close(); });
    menu.appendChild(cp);
    if (navigator.share) {
      const nb = document.createElement('button');
      nb.className = 'share-item'; nb.textContent = 'Flere apper …';
      nb.addEventListener('click', async () => { close(); try { await navigator.share({ title: 'Ambient Mann — ' + title, text, url }); } catch (_) {} });
      menu.appendChild(nb);
    }
    const cancel = document.createElement('button');
    cancel.className = 'share-item share-cancel'; cancel.textContent = 'Avbryt';
    cancel.addEventListener('click', () => close());
    menu.appendChild(cancel);

    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    back.appendChild(menu);
    document.body.appendChild(back);
  }
  async function copyLink(i) {
    const t = list()[i]; if (!t || !t.id) return;
    try { await copyToClipboard(trackUrl(t)); UI.toast('Lenke til sporet er kopiert!'); }
    catch (_) { UI.toast('Kunne ikke kopiere lenken.'); }
  }

  function render() { paintPlayer(); renderList(); }

  // ---- fortsett fra spor-side ---------------------------------------------
  // Når man spiller et spor på en delbar spor-side (/track/<slug>) og trykker
  // «← Ambient Mann»-lenka tilbake til forsiden, skal hovedspilleren plukke
  // opp samme spor der man slapp og spille videre. Spor-sida lagrer tilstanden
  // i localStorage (samme domene), og vi leser den her – kun én gang, og kun
  // hvis tilbake-lenka faktisk ble trykket (ikke ved vanlig besøk på forsiden).
  const RESUME_KEY = 'am_track_resume';
  const RESUME_GO = 'am_track_resume_go';
  function resume() {
    let go = false, h = null;
    try { go = localStorage.getItem(RESUME_GO) === '1'; } catch (_) {}
    try { localStorage.removeItem(RESUME_GO); } catch (_) {}
    if (!go) return;
    try { h = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (_) {}
    if (!h || !h.ts || (Date.now() - h.ts) > 30 * 60 * 1000) return; // ignorer eldre enn 30 min
    const tr = list();
    let i = tr.findIndex(t => t && String(t.id) === String(h.id));
    if (i < 0 && h.slug) i = tr.findIndex(t => t && slugify(t.title) === h.slug);
    if (i < 0) return;
    if (!tr[i].url) return;
    audio.src = tr[i].url; current = i;
    const t0 = Math.max(0, Number(h.time) || 0);
    if (t0 > 0) audio.addEventListener('loadedmetadata', function seek() {
      audio.removeEventListener('loadedmetadata', seek);
      try { audio.currentTime = t0; } catch (_) {}
    }, { once: true });
    paintPlayer(); renderList();
    // Vis at det spiller: rull spilleren inn i synsfeltet.
    const cov = document.getElementById('tp-cover');
    if (cov) try { cov.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    if (h.playing !== false) {
      const p = audio.play();
      if (p && p.catch) p.catch(() => {
        // Nettleseren blokkerte autoplay – start ved første trykk/tast.
        const kick = () => { audio.play().catch(() => {}); document.removeEventListener('pointerdown', kick); document.removeEventListener('keydown', kick); };
        document.addEventListener('pointerdown', kick, { once: true });
        document.addEventListener('keydown', kick, { once: true });
      });
    }
  }

  // ---- eier: opplasting (lyd + eget cover-bilde) --------------------------
  async function doUpload() {
    const fileEl = document.getElementById('track-file');
    const coverEl = document.getElementById('track-cover');
    const titleEl = document.getElementById('track-title');
    const status = document.getElementById('track-upstatus');
    const btn = document.getElementById('track-upload');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!file) { UI.toast('Velg en lyd-fil (WAV/MP3).'); return; }
    if (!Owner.isOwner()) { UI.toast('Logg inn som eier for å laste opp.'); return; }
    if (!SC_Storage.isConfigured()) { UI.toast('Lyd-lagring er ikke satt opp ennå (mangler Supabase i config).'); return; }
    // Hver opplasting skal gi sin egen URL (/track/<navn>). Samme navn = samme
    // URL, som da ville peke til det gamle sporet – stopp og be om et unikt navn.
    const wantTitle = (titleEl && titleEl.value.trim()) || file.name.replace(/\.[a-z0-9]+$/i, '');
    const wantSlug = slugify(wantTitle);
    if (wantSlug && list().some(t => slugify(t.title) === wantSlug)) {
      if (status) status.textContent = '';
      UI.toast('Det finnes allerede et spor med dette navnet (samme lenke). Gi det et unikt navn.');
      if (titleEl) titleEl.focus();
      return;
    }
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '⏳ Laster opp …'; }
    const total = fmtSize(file.size);
    if (status) status.textContent = 'Laster opp lyd … 0% av ' + total;
    try {
      const up = await SC_Storage.upload(file, {
        prefix: 'tracks',
        onProgress: p => {
          if (status) status.textContent = 'Laster opp lyd … ' + Math.round(p * 100) + '% av ' + total +
            (p >= 1 ? ' – lagrer …' : '');
        },
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
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        UI.toast('Fikk lastet opp lyden, men klarte ikke lagre i lista' + (d.error ? ': ' + d.error : '.'));
      }
      const arr = list(); arr.push(meta); await Content.set('tracks', arr);
      // Vis den nye, delbare URL-en som navnet lager (én ny URL per spor).
      const newUrl = trackUrl(meta);
      if (status) {
        status.innerHTML = '✅ Lagt til! Ny lenke: <a href="' + UI.esc(newUrl) + '" target="_blank" rel="noopener">' +
          UI.esc(newUrl.replace(/^https?:\/\//, '')) + '</a>';
      }
      try { await copyToClipboard(newUrl); UI.toast('Sporet er lagt til – lenken er kopiert.'); }
      catch (_) { UI.toast('Sporet er lagt til.'); }
      if (fileEl) fileEl.value = ''; if (coverEl) coverEl.value = ''; if (titleEl) titleEl.value = '';
      render();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (status) status.textContent = 'Feil: ' + msg;
      UI.toast(msg === 'not-configured' ? 'Lyd-lagring ikke satt opp.' : ('Opplasting feilet: ' + msg));
    } finally {
      if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
    }
  }

  // ---- eier: bestem rekkefølgen (flytt hvert spor opp/ned) ----------------
  // Bytter sporet med naboen i VISNINGSrekkefølgen (som er reversert), og lagrer
  // den nye rekkefølgen i 'tracks'. Slik kan eier plassere hver enkelt opplasting
  // akkurat der han vil – og rekkefølgen gjelder for ALLE besøkende.
  async function move(i, dir) {
    if (!Owner.isOwner()) return;
    const arr = list();
    if (!arr[i]) return;
    const order = arr.map((_, x) => x).reverse();      // samme visning som renderList()
    const k = order.indexOf(i);
    const k2 = dir === 'up' ? k - 1 : k + 1;
    if (k2 < 0 || k2 >= order.length) return;           // allerede øverst/nederst
    const j = order[k2];                                // ekte array-indeks å bytte med
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    // Hold spilleren pekende på samme spor etter byttet.
    if (current === i) current = j; else if (current === j) current = i;
    await Content.set('tracks', arr);
    render();
  }

  // ---- eier: endre navn (tittel) på et spor -------------------------------
  // Tittelen lager sporets delbare lenke (/podcast/<slug>), så vi advarer om at
  // en endring bryter tidligere delte lenker med det gamle navnet. Avspillings-
  // tallet følger spor-id-en, så det bevares uendret ved omdøping.
  function rename(i) {
    const t = list()[i]; if (!t) return;
    openRenameDialog(t, i);
  }
  function openRenameDialog(t, i) {
    const back = document.createElement('div');
    back.className = 'share-back';
    const menu = document.createElement('div');
    menu.className = 'share-menu';
    const head = document.createElement('div');
    head.className = 'share-title';
    head.textContent = 'Endre navn på sporet';
    menu.appendChild(head);

    const note = document.createElement('p');
    note.className = 'muted';
    note.style.cssText = 'font-size:13px;margin:0 0 10px;text-align:left';
    note.textContent = 'Navnet lager sporets delbare lenke (/podcast/…). Endrer du navnet, endres lenken – tidligere delte lenker med det gamle navnet slutter å virke. Avspillingstallet beholdes.';
    menu.appendChild(note);

    const input = document.createElement('input');
    input.className = 'input'; input.type = 'text';
    input.value = t.title || ''; input.setAttribute('aria-label', 'Nytt navn');
    menu.appendChild(input);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary'; saveBtn.style.flex = '1'; saveBtn.textContent = 'Lagre';
    const cancel = document.createElement('button');
    cancel.className = 'btn'; cancel.style.flex = '1'; cancel.textContent = 'Avbryt';
    row.appendChild(saveBtn); row.appendChild(cancel);
    menu.appendChild(row);

    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    async function doSave() {
      const nv = input.value.trim();
      if (!nv) { UI.toast('Skriv et navn.'); input.focus(); return; }
      if (nv === (t.title || '')) { close(); return; }
      const newSlug = slugify(nv);
      if (newSlug && list().some((x, j) => j !== i && slugify(x.title) === newSlug)) {
        UI.toast('Et annet spor har allerede dette navnet (samme lenke). Velg et unikt navn.');
        input.focus(); return;
      }
      saveBtn.disabled = true; cancel.disabled = true;
      const arr = list();
      if (!arr[i]) { close(); return; }
      arr[i].title = nv;
      await Content.set('tracks', arr);
      render();
      close();
      UI.toast('Navnet er endret.');
    }
    saveBtn.addEventListener('click', doSave);
    cancel.addEventListener('click', close);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doSave(); });
    back.addEventListener('click', (ev) => { if (ev.target === back) close(); });
    document.addEventListener('keydown', onKey);
    back.appendChild(menu);
    document.body.appendChild(back);
    input.focus(); input.select();
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

  return { render, bind, play, resume };
})();
