/* =========================================================================
 * AMBIENT MANN — oppstart / liming
 * Laster innhold, starter spilleren, tegner seksjonene, kobler eier-editorene
 * og registrerer PWA-service-worker.
 * ========================================================================= */
(function () {
  const C = window.AM_CONFIG || {};

  // ---- Booking (gratis, via e-post) --------------------------------------
  function bookingHref() {
    const to = (C.bookingEmails || []).join(',');
    const q = 'subject=' + encodeURIComponent(C.bookingSubject || 'Booking') +
              '&body=' + encodeURIComponent(C.bookingBody || '');
    return 'mailto:' + to + '?' + q;
  }
  function wireBooking() {
    UI.$all('.book-btn').forEach(a => a.setAttribute('href', bookingHref()));
    const emailsEl = document.getElementById('booking-emails');
    if (emailsEl) {
      emailsEl.innerHTML = (C.bookingEmails || []).map(e =>
        '<a href="mailto:' + UI.esc(e) + '">' + UI.esc(e) + '</a>').join(' · ');
    }
  }

  // ---- Kontakt (går direkte til Ambient Manns e-post) --------------------
  function contactHref() {
    const to = C.contactEmail || '';
    const q = 'subject=' + encodeURIComponent(C.contactSubject || 'Kontakt') +
              '&body=' + encodeURIComponent(C.contactBody || '');
    return 'mailto:' + to + '?' + q;
  }
  function wireContact() {
    const email = C.contactEmail || '';
    UI.$all('.contact-btn').forEach(a => a.setAttribute('href', contactHref()));
    // Synlig adresse (webmail-brukere uten mailto-handler kan lese/klikke/kopiere)
    const link = document.getElementById('contact-email-link');
    if (link) { link.textContent = email; link.setAttribute('href', 'mailto:' + email); }
    const copy = document.getElementById('contact-copy');
    if (copy) copy.addEventListener('click', async () => {
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(email);
        else { const t = document.createElement('textarea'); t.value = email; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        UI.toast('E-postadresse kopiert: ' + email);
      } catch (_) { UI.toast('Kopier manuelt: ' + email); }
    });
  }

  // ---- Bunn-logoer + bakgrunn + hero-logo (fra config) --------------------
  function wireAssets() {
    const A = C.assets || {}, L = C.links || {};
    const set = (id, src, href) => {
      const el = document.getElementById(id);
      if (!el) return;
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (img && src) img.setAttribute('src', src);
      if (el.tagName === 'A' && href) el.setAttribute('href', href);
    };
    // bakgrunn
    if (A.universeBg) document.body.style.setProperty('--bg-image', 'url("' + A.universeBg + '")');
    // hero-logo
    const hero = document.getElementById('hero-logo');
    if (hero && A.logo) hero.setAttribute('src', A.logo);
    // bunn-logoer (klikkbare)
    set('logo-portrait', A.portrait, L.radioQ37Artist);
    set('logo-feedfreq', A.feedfreqLogo, L.feedfreq);
    set('logo-newmessage', A.newMessageLogo, L.newMessageFromGod || null);
    set('logo-psybient', A.psybientLogo, L.psybient);
    set('logo-diceradio', A.diceRadioLogo, L.diceRadio);
    set('logo-trancentral', A.trancentralLogo, L.trancentral);
    set('logo-itathens', A.itAthensLogo, L.itAthens);
    set('logo-newmessageorg', A.newMessageOrgLogo, L.newMessageOrg);
    set('logo-siriusfm', A.siriusfmLogo, L.siriusfm);
  }

  // ---- Kreditter-liste ----------------------------------------------------
  function wireCredits() {
    const el = document.getElementById('label-credits');
    if (el) el.innerHTML = (C.labelCredits || []).map(x => '<li>' + UI.esc(x) + '</li>').join('');
  }

  // ---- Eier-editorer (bio / kreditter / live-tekst / stream) --------------
  function wireOwnerEditors() {
    const fill = () => {
      const map = { 'edit-bio': 'bio', 'edit-credits': 'credits', 'edit-livedesc': 'liveDescription' };
      Object.keys(map).forEach(id => { const t = document.getElementById(id); if (t) t.value = Content.get(map[id]); });
      const st = Content.get('stream') || {};
      const su = document.getElementById('stream-url'); if (su) su.value = st.url || '';
      const sn = document.getElementById('stream-np'); if (sn) sn.value = st.nowPlayingUrl || '';
    };
    fill();
    const saveText = (id, key, after) => {
      const btn = document.getElementById('save-' + id);
      const ta = document.getElementById('edit-' + id);
      if (btn && ta) btn.addEventListener('click', async () => { await Content.set(key, ta.value.trim()); Content.applyText(); if (after) after(); });
    };
    saveText('bio', 'bio');
    saveText('credits', 'credits');
    saveText('livedesc', 'liveDescription');
    const ss = document.getElementById('save-stream');
    if (ss) ss.addEventListener('click', async () => {
      await Content.set('stream', {
        url: (document.getElementById('stream-url') || {}).value || '',
        nowPlayingUrl: (document.getElementById('stream-np') || {}).value || '',
      });
      Player.poll();
    });

    // Live-bakgrunn (bilde eller mp4-video)
    const lbType = document.getElementById('livebg-type');
    const lbUrl = document.getElementById('livebg-url');
    const lb = Content.get('liveBg') || {};
    if (lbType) lbType.value = lb.type || 'image';
    if (lbUrl) lbUrl.value = lb.url || '';
    const saveLb = document.getElementById('save-livebg');
    if (saveLb) saveLb.addEventListener('click', async () => {
      const status = document.getElementById('livebg-status');
      const fileEl = document.getElementById('livebg-file');
      let url = (lbUrl && lbUrl.value.trim()) || '';
      const type = (lbType && lbType.value) || 'image';
      const f = fileEl && fileEl.files && fileEl.files[0];
      if (f) {
        if (!SC_Storage.isConfigured()) { UI.toast('Opplasting krever Supabase (se README).'); return; }
        if (status) status.textContent = 'Laster opp …';
        try { const up = await SC_Storage.upload(f, { prefix: 'livebg' }); url = up.url; if (lbUrl) lbUrl.value = url; }
        catch (_) { UI.toast('Opplasting feilet.'); if (status) status.textContent = ''; return; }
      }
      await Content.set('liveBg', { type: type, url: url });
      if (status) status.textContent = 'Lagret.';
      Player.render();
    });
  }

  // ---- Nav toggle (mobil) -------------------------------------------------
  function wireNav() {
    const t = document.getElementById('nav-toggle'), nav = document.getElementById('nav');
    if (t && nav) t.addEventListener('click', () => nav.classList.toggle('open'));
    UI.$all('#nav a').forEach(a => a.addEventListener('click', () => nav && nav.classList.remove('open')));
  }

  async function boot() {
    wireAssets();
    wireCredits();
    wireBooking();
    wireContact();
    wireNav();
    Owner.bind();
    Guest.bind();
    Chat.init();
    if (window.PWAInstall) PWAInstall.init();
    Donation.bind();
    Donation.handleReturn();

    await Content.load();
    Content.applyText();
    wireOwnerEditors();
    Player.init();
    Schedule.bind(); Schedule.render();
    Links.bind(); Links.render();
    Labels.bind(); Labels.render();
    Tracks.bind(); Tracks.render(); Tracks.resume();
    Guest.render();
    Owner.applyVisibility();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
