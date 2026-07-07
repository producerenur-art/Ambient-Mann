/* =========================================================================
 * AMBIENT MANN — innhold eieren kan endre (bio, sendeplan, lenker, stream)
 * Leser offentlig innhold fra api/site?action=content-get. Faller tilbake til
 * standardene i AM_CONFIG + en lokal localStorage-kladd hvis serveren ikke er
 * satt opp ennå. Eier-skriving går via api/site?action=content-set (token).
 * KRITISK: den bevisst utelatte label-en filtreres defensivt bort hvis den
 * noen gang skulle dukke opp i lagret innhold (se BANNED-regexen under).
 * ========================================================================= */
window.Content = (function () {
  const DRAFT = 'am_content_draft';
  let cache = {};   // { bio, credits, liveDescription, schedule[], links[], stream{} , tracks[] }
  let loaded = false;

  const BANNED = /kali\s*earth/ig;
  function clean(v) {
    if (typeof v === 'string') return v.replace(BANNED, '').replace(/\s{2,}/g, ' ').trim();
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = clean(v[k]); return o; }
    return v;
  }

  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT) || '{}'); } catch (_) { return {}; } }
  function writeDraft(obj) { try { localStorage.setItem(DRAFT, JSON.stringify(obj)); } catch (_) {} }

  // Hent offentlig innhold. Alltid trygg: feiler den, brukes standarder.
  async function load() {
    try {
      const r = await fetch('/api/site?action=content-get', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        cache = clean(d || {});
      } else {
        cache = readDraft();
      }
    } catch (_) {
      cache = readDraft();   // offline / statisk server → lokal kladd
    }
    loaded = true;
    return cache;
  }

  // get(key) → lagret verdi, ellers fornuftig standard fra AM_CONFIG.
  function get(key) {
    if (cache[key] != null) return cache[key];
    const C = window.AM_CONFIG || {};
    switch (key) {
      case 'bio': return C.bioDefault || '';
      case 'credits': return C.bioCreditsDefault || '';
      case 'liveDescription': return C.liveDescriptionDefault || '';
      case 'schedule': return [];
      case 'links': return (C.podcastLinks || []).slice();
      case 'stream': return { url: C.streamUrl || '', nowPlayingUrl: C.nowPlayingUrl || '' };
      case 'liveBg': return { type: 'image', url: '' };
      case 'tracks': return [];
      default: return null;
    }
  }

  // Eier-skriving. Lagrer server-side hvis mulig, ellers lokal kladd (preview).
  async function set(key, data) {
    data = clean(data);
    cache[key] = data;
    try {
      const r = await Owner.authFetch('/api/site?action=content-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, data: data }),
      });
      if (r.ok) { UI.toast('Lagret.'); return true; }
      if (r.status === 401) { UI.toast('Logg inn som eier først.'); return false; }
      // 503 e.l. → lagre lokalt så eieren kan forhåndsvise
      const draft = readDraft(); draft[key] = data; writeDraft(draft);
      UI.toast('Publisering er ikke satt opp ennå – lagret lokalt (kun synlig for deg).');
      return false;
    } catch (_) {
      const draft = readDraft(); draft[key] = data; writeDraft(draft);
      UI.toast('Ingen server – lagret lokalt (kun synlig for deg).');
      return false;
    }
  }

  // Skriv bio/kreditter/live-tekst inn i DOM ved oppstart.
  function applyText() {
    const bio = document.getElementById('bio-text');
    if (bio) bio.textContent = get('bio');
    const cr = document.getElementById('bio-credits');
    if (cr) cr.textContent = get('credits');
    const ld = document.getElementById('live-desc');
    if (ld) ld.textContent = get('liveDescription');
  }

  return { load, get, set, applyText, isLoaded: () => loaded };
})();
