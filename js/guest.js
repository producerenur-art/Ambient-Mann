/* =========================================================================
 * AMBIENT MANN — GJEST SHOW LIVE STREAM (flere gjester)
 * Godkjente gjester logger inn (samme flyt som admin, men egen konto):
 *   registrer (navn + e-post + passord) → bekreft e-post → Ambient Mann
 *   godkjenner → gjesten kan sette sendetid, laste opp musikk og egen live-strøm.
 * Publikum ser gjestenes sendeplan, live-strømmer og opplastede spor.
 * Server (api/site.js) gir et kortlevd HMAC-token (purpose:'guest') som sendes
 * som Bearer på alle gjeste-kall. Admin (Owner) er uendret.
 * ========================================================================= */
window.Guest = (function () {
  const KEY = 'am_guest_token';
  const META = 'am_guest_meta';        // { name, approved }
  let mode = 'login';                  // 'login' | 'signup' | 'forgot' | 'reset'
  let resetToken = '';

  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function isGuest() { return !!token(); }
  function meta() { try { return JSON.parse(sessionStorage.getItem(META) || '{}'); } catch (_) { return {}; } }
  function myName() { return meta().name || ''; }
  function myGid() { return meta().gid || null; }
  function isApproved() { return !!meta().approved; }
  function save(t, m) {
    try { sessionStorage.setItem(KEY, t); sessionStorage.setItem(META, JSON.stringify(m || {})); } catch (_) {}
  }
  function clearSession() { try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(META); } catch (_) {} }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token() });
    return fetch(url, opts);
  }
  async function post(action, body) {
    const r = await fetch('/api/site?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    const d = await r.json().catch(() => ({}));
    return { r, d };
  }
  async function status() {
    try { const r = await fetch('/api/site?action=guest-status'); return await r.json(); }
    catch (_) { return { signupSupported: false, resetSupported: false }; }
  }

  // ---- data-hjelpere (offentlig innhold via Content) -----------------------
  function schedule() { const a = (window.Content && Content.get('guestSchedule')) || []; return Array.isArray(a) ? a : []; }
  function tracks() { const a = (window.Content && Content.get('guestTracks')) || []; return Array.isArray(a) ? a : []; }
  function streams() { const o = (window.Content && Content.get('guestStreams')) || {}; return (o && typeof o === 'object') ? o : {}; }

  function fmt(iso) {
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function statusOf(e) {
    if (window.Schedule && Schedule.statusOf) return Schedule.statusOf(e);
    const start = new Date(e.start).getTime();
    const end = start + (Number(e.hours) || 1) * 3600e3 + 15 * 60e3;
    const now = Date.now();
    if (isNaN(start)) return 'past';
    return now < start ? 'upcoming' : (now <= end ? 'live' : 'past');
  }
  function liveGids() {
    const set = {};
    schedule().forEach(e => { if (statusOf(e) === 'live') set[e.gid] = true; });
    return set;
  }
  function canDelete(entry) { return Owner.isOwner() || (isGuest() && entry.gid === myGid()); }

  // ---- offentlig visning ---------------------------------------------------
  function renderStreams() {
    const wrap = document.getElementById('guest-streams'); if (!wrap) return;
    const obj = streams(); const live = liveGids();
    const items = Object.keys(obj).map(k => obj[k]).filter(s => s && s.url);
    if (!items.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = items.map(s => {
      const isLive = !!live[s.gid];
      const badge = isLive
        ? '<span class="badge badge-live"><span class="dot"></span>LIVE</span>'
        : '<span class="badge">Stream</span>';
      return '<div class="card guest-stream-card">' +
        '<div class="gs-head"><b translate="no" class="notranslate">' + UI.esc(s.guestName || 'Guest') + '</b> ' + badge + '</div>' +
        '<audio class="gs-audio" controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="none" src="' + UI.esc(s.url) + '"></audio>' +
      '</div>';
    }).join('');
  }

  function renderSchedule() {
    const wrap = document.getElementById('guest-schedule'); if (!wrap) return;
    const all = schedule().slice().sort((a, b) => new Date(a.start) - new Date(b.start));
    const upcoming = all.filter(e => statusOf(e) !== 'past');
    if (!upcoming.length) {
      wrap.innerHTML = '<p class="muted">No guest broadcasts scheduled yet.</p>';
    } else {
      wrap.innerHTML = upcoming.map(e => {
        const st = statusOf(e);
        const badge = st === 'live'
          ? '<span class="badge badge-live"><span class="dot"></span>LIVE</span>'
          : '<span class="badge">Upcoming</span>';
        const link = e.link
          ? ' <a class="gs-link" href="' + UI.esc(e.link) + '" target="_blank" rel="noopener">↗ Open</a>' : '';
        const del = canDelete(e)
          ? '<button class="btn btn-tiny" data-gdel-sched="' + UI.esc(e.id) + '">Delete</button>' : '';
        return '<div class="sched-row">' +
          '<div class="sched-when">' + UI.esc(fmt(e.start)) + ' · ' + (Number(e.hours) || 1) + ' h</div>' +
          '<div class="sched-title"><span translate="no" class="notranslate">' + UI.esc(e.guestName || 'Guest') + '</span> — ' + UI.esc(e.title || 'Live set') + link + '</div>' +
          badge + del +
        '</div>';
      }).join('');
    }
    UI.$all('[data-gdel-sched]', wrap).forEach(b =>
      b.addEventListener('click', () => delSchedule(b.getAttribute('data-gdel-sched'))));
  }

  function renderTracks() {
    const wrap = document.getElementById('guest-tracks'); if (!wrap) return;
    const arr = tracks();
    if (!arr.length) { wrap.innerHTML = '<p class="muted">No guest music yet.</p>'; return; }
    wrap.innerHTML = arr.map(t => {
      const cov = t.coverUrl
        ? '<span class="track-cover" style="background-image:url(\'' + UI.esc(t.coverUrl) + '\')"></span>'
        : '<span class="track-cover empty">♪</span>';
      const del = canDelete(t)
        ? '<button class="btn btn-tiny" data-gdel-track="' + UI.esc(t.id) + '">Delete</button>' : '';
      return '<div class="track-row guest-track-row">' + cov +
        '<div class="track-meta"><div class="track-title">' + UI.esc(t.title || 'Track') + '</div>' +
        '<div class="track-sub"><span translate="no" class="notranslate">' + UI.esc(t.guestName || 'Guest') + '</span></div></div>' +
        '<audio class="gt-audio" controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="none" src="' + UI.esc(t.url) + '"></audio>' + del +
      '</div>';
    }).join('');
    UI.$all('[data-gdel-track]', wrap).forEach(b =>
      b.addEventListener('click', () => delTrack(b.getAttribute('data-gdel-track'))));
  }

  // ---- innlogget-tilstand (panel / venter / nav-navn) ----------------------
  function applyVisibility() {
    const on = isGuest(), approved = isApproved();
    const ownerOn = !!(window.Owner && Owner.isOwner());
    const canSee = on || ownerOn;

    // Hele gjest-seksjonen er skjult for publikum; vises kun for innlogget gjest/eier.
    // Innlogging skjer fra «Gjest-innlogging»-knappen i toppbaren.
    const section = document.getElementById('guest-live');
    if (section) section.style.display = canSee ? '' : 'none';
    const priv = document.getElementById('guest-private-content');
    if (priv) priv.style.display = '';

    const panel = document.getElementById('guest-panel');
    const pending = document.getElementById('guest-pending');
    if (panel) panel.style.display = (on && approved) ? '' : 'none';
    if (pending) pending.style.display = (on && !approved) ? '' : 'none';

    // Toppbar-knapp: gjest-innlogging / logg ut (skjules for eier).
    const hbtn = document.getElementById('guest-login-btn');
    if (hbtn) {
      hbtn.style.display = ownerOn ? 'none' : '';
      hbtn.textContent = on ? 'Log out guest' : 'Guest login';
    }

    // Nav-lenken «Gjest» peker inn i seksjonen — kun nyttig når den er synlig.
    const navLink = document.getElementById('guest-nav');
    if (navLink) navLink.style.display = canSee ? '' : 'none';

    // Gammel innloggings-CTA inne i seksjonen er erstattet av toppbar-knappen.
    const cta = document.querySelector('#guest-live .guest-auth-cta');
    if (cta) cta.style.display = 'none';

    const btn = document.getElementById('guest-btn');
    if (btn) btn.textContent = on ? 'Log out as guest' : 'Log in as guest';
    const stx = document.getElementById('guest-status-text');
    if (stx) stx.textContent = on ? (approved ? ('Logged in as ' + myName()) : 'Logged in – waiting for approval') : '';

    const nav = document.getElementById('guest-nav-name');
    if (nav) nav.textContent = (on && myName()) ? ('· ' + myName()) : '';
    const pn = document.getElementById('guest-panel-name');
    if (pn) pn.textContent = myName();
  }

  function render() {
    renderStreams(); renderSchedule(); renderTracks();
    applyVisibility();
    if (Owner.isOwner()) loadAdmin();
  }

  async function reloadAndRender() {
    if (window.Content && Content.load) { try { await Content.load(); } catch (_) {} }
    render();
    if (window.Player && Player.render) try { Player.render(); } catch (_) {}
  }

  // ---- modal ---------------------------------------------------------------
  const M = {};
  function grab() {
    M.overlay = document.getElementById('guest-modal');
    M.title = document.getElementById('guest-modal-title');
    M.sub = document.getElementById('guest-modal-sub');
    M.nameField = document.getElementById('guest-name-field');
    M.name = document.getElementById('guest-name');
    M.emailField = document.getElementById('guest-email-field');
    M.email = document.getElementById('guest-email');
    M.passField = document.getElementById('guest-pass-field');
    M.passLabel = document.getElementById('guest-pass-label');
    M.pass = document.getElementById('guest-pass');
    M.submit = document.getElementById('guest-submit');
    M.toggle = document.getElementById('guest-toggle-mode');
    M.forgot = document.getElementById('guest-forgot');
    M.back = document.getElementById('guest-back');
  }
  function show(v) { if (M.overlay) M.overlay.classList.toggle('open', v); }

  let flags = { signupSupported: false, resetSupported: false };
  function setMode(m) {
    mode = m;
    const T = {
      login:  ['Log in as guest', 'For approved guests.', 'Password', 'Log in'],
      signup: ['Sign up as guest', 'Create an account (password min. 6 characters). You have to confirm your email.', 'Password', 'Sign up'],
      forgot: ['Forgot password', 'Enter your email and we will send you a reset link.', '', 'Send link'],
      reset:  ['Set new password', 'Choose a new password (min. 6 characters).', 'New password', 'Save & log in'],
    }[m];
    if (M.title) M.title.textContent = T[0];
    if (M.sub) M.sub.textContent = T[1];
    if (M.passLabel) M.passLabel.textContent = T[2];
    if (M.submit) M.submit.textContent = T[3];
    if (M.nameField) M.nameField.style.display = (m === 'signup') ? '' : 'none';
    if (M.emailField) M.emailField.style.display = (m === 'reset') ? 'none' : '';
    if (M.passField) M.passField.style.display = (m === 'forgot') ? 'none' : '';
    if (M.toggle) {
      M.toggle.style.display = (m === 'login' || m === 'signup') && flags.signupSupported ? '' : 'none';
      M.toggle.textContent = (m === 'signup') ? 'Already have an account? Log in' : 'New guest? Sign up';
    }
    if (M.forgot) M.forgot.style.display = (m === 'login' && flags.resetSupported) ? '' : 'none';
    if (M.back) M.back.style.display = (m === 'forgot') ? '' : 'none';
    if (M.pass) M.pass.value = '';
  }

  async function open() {
    flags = await status();
    setMode('login');
    show(true);
    if (M.email) M.email.focus();
  }

  async function submit() {
    const name = (M.name && M.name.value.trim()) || '';
    const email = (M.email && M.email.value.trim()) || '';
    const pass = (M.pass && M.pass.value) || '';

    if (mode === 'login') {
      const { r, d } = await post('guest-login', { email, password: pass });
      if (r.ok && d.token) {
        save(d.token, { name: d.name, approved: d.approved, gid: d.gid || decodeGid(d.token) });
        show(false); UI.toast('Logged in.'); reloadAndRender();
      } else UI.toast(d.error || 'Wrong email or password.');

    } else if (mode === 'signup') {
      if (!name) return UI.toast('Enter your name / artist name.');
      if (pass.length < 6) return UI.toast('Password must be at least 6 characters.');
      const { r, d } = await post('guest-signup', { name, email, password: pass });
      if (r.ok) {
        show(false);
        UI.toast(d.needsConfirm
          ? 'Account created – check your email for a confirmation link.'
          : 'Account created. You can log in now (waiting for approval).');
      } else UI.toast(d.error || 'Could not create the account.');

    } else if (mode === 'forgot') {
      if (!email) return UI.toast('Enter your email.');
      await post('guest-forgot', { email });
      show(false);
      UI.toast('If the email matches, a reset link has been sent.');

    } else if (mode === 'reset') {
      if (pass.length < 6) return UI.toast('At least 6 characters.');
      const { r, d } = await post('guest-reset', { token: resetToken, password: pass });
      if (r.ok && d.token) {
        save(d.token, { name: d.name, approved: d.approved, gid: d.gid || decodeGid(d.token) });
        show(false); UI.toast('New password saved – you are logged in.');
        history.replaceState({}, '', location.pathname);
        reloadAndRender();
      } else UI.toast(d.error || 'The link is invalid or has expired.');
    }
  }

  // les gid ut av HMAC-tokenets payload (base64url.<sig>) – kun til lokal filtrering
  function decodeGid(tok) {
    try {
      const p = String(tok).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4)))));
      return json.gid || null;
    } catch (_) { return null; }
  }

  function logout() { clearSession(); UI.toast('Logged out.'); render(); }

  // ---- gjest-konsoll: sendetid / opplasting / strøm ------------------------
  async function addSchedule() {
    const when = document.getElementById('gsched-when');
    const hours = document.getElementById('gsched-hours');
    const title = document.getElementById('gsched-title');
    const link = document.getElementById('gsched-link');
    if (!when || !when.value) return UI.toast('Pick a date and time.');
    const { r, d } = await postAuth('guest-schedule-add', {
      start: when.value,
      hours: parseInt(hours && hours.value, 10) || 2,
      title: (title && title.value.trim()) || 'Live set',
      link: (link && link.value.trim()) || '',
    });
    if (r.ok) {
      UI.toast('Broadcast time added.');
      if (title) title.value = ''; if (link) link.value = '';
      reloadAndRender();
    } else UI.toast(d.error || 'Could not save the broadcast time.');
  }

  async function delSchedule(id) {
    const { r, d } = await postAuth('guest-schedule-delete', { id });
    if (r.ok) reloadAndRender(); else UI.toast(d.error || 'Could not delete.');
  }

  async function postAuth(action, body) {
    const res = await authFetch('/api/site?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    return { r: res, d: await res.json().catch(() => ({})) };
  }

  // egen opplasting (mirrorer SC_Storage.upload, men med gjest-auth + egen mappe)
  async function guestUpload(file, prefix) {
    if (!SC_Storage.isConfigured()) throw new Error('not-configured');
    const m = (file.name || '').match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : ((file.type || '').split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
    const uuid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2));
    const path = (prefix || 'media') + '/' + uuid + '.' + (ext || 'bin');
    const resp = await authFetch('/api/site?action=guest-upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
    });
    const info = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(info.error || ('upload-url HTTP ' + resp.status));
    const { error } = await SC_Storage.client()
      .storage.from(info.bucket)
      .uploadToSignedUrl(info.path, info.token, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (error) throw new Error(error.message || 'Upload failed');
    return { url: info.publicUrl, path: info.path, size: file.size };
  }

  async function uploadTrack() {
    const fileEl = document.getElementById('gtrack-file');
    const coverEl = document.getElementById('gtrack-cover');
    const titleEl = document.getElementById('gtrack-title');
    const st = document.getElementById('gtrack-status');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!file) return UI.toast('Pick an audio file (WAV/MP3).');
    if (!SC_Storage.isConfigured()) return UI.toast('Audio storage is not set up (Supabase missing in config).');
    if (st) st.textContent = 'Uploading audio … (large files may take a while)';
    try {
      const up = await guestUpload(file, 'tracks');
      let coverUrl = '', coverPath = '';
      const cf = coverEl && coverEl.files && coverEl.files[0];
      if (cf) { if (st) st.textContent = 'Uploading cover …'; const cu = await guestUpload(cf, 'covers'); coverUrl = cu.url; coverPath = cu.path; }
      const meta = {
        id: 'gt_' + Date.now().toString(36),
        title: (titleEl && titleEl.value.trim()) || file.name.replace(/\.[a-z0-9]+$/i, ''),
        url: up.url, path: up.path, size: up.size, coverUrl, coverPath,
      };
      const { r, d } = await postAuth('guest-track-add', meta);
      if (!r.ok) { if (st) st.textContent = 'Error: ' + (d.error || ''); return UI.toast(d.error || 'Could not save the track.'); }
      if (st) st.textContent = 'Added!';
      if (fileEl) fileEl.value = ''; if (coverEl) coverEl.value = ''; if (titleEl) titleEl.value = '';
      reloadAndRender();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (st) st.textContent = 'Error: ' + msg;
      UI.toast(msg === 'not-configured' ? 'Audio storage is not set up.' : ('Upload failed: ' + msg));
    }
  }

  async function delTrack(id) {
    const { r, d } = await postAuth('guest-track-delete', { id });
    if (r.ok) reloadAndRender(); else UI.toast(d.error || 'Could not delete.');
  }

  async function saveStream() {
    const url = (document.getElementById('gstream-url') || {}).value || '';
    const np = (document.getElementById('gstream-np') || {}).value || '';
    const st = document.getElementById('gstream-status');
    const { r, d } = await postAuth('guest-stream-set', { url: url.trim(), nowPlayingUrl: np.trim() });
    if (r.ok) { if (st) st.textContent = 'Saved.'; UI.toast('Live stream saved.'); reloadAndRender(); }
    else { if (st) st.textContent = ''; UI.toast(d.error || 'Could not save the stream.'); }
  }

  function fillPanel() {
    const obj = streams(); const mine = obj[myGid()] || {};
    const u = document.getElementById('gstream-url'); if (u) u.value = mine.url || '';
    const n = document.getElementById('gstream-np'); if (n) n.value = mine.nowPlayingUrl || '';
  }

  // ---- eier: godkjenn / avvis gjester --------------------------------------
  async function loadAdmin() {
    const wrap = document.getElementById('guest-admin-list'); if (!wrap) return;
    try {
      const r = await Owner.authFetch('/api/site?action=guest-list');
      const d = await r.json().catch(() => ({}));
      const list = (d && d.guests) || [];
      if (!list.length) { wrap.innerHTML = '<p class="muted">No guests yet.</p>'; return; }
      wrap.innerHTML = list.map(g => {
        const state = !g.confirmed ? '<span class="badge">Unconfirmed</span>'
          : (g.approved ? '<span class="badge badge-live">Approved</span>' : '<span class="badge">Pending</span>');
        const approveBtn = g.approved
          ? '<button class="btn btn-tiny" data-gunapprove="' + g.id + '">Revoke</button>'
          : '<button class="btn btn-tiny" data-gapprove="' + g.id + '">Approve</button>';
        return '<div class="sched-row">' +
          '<div class="sched-when"><span translate="no" class="notranslate">' + UI.esc(g.name || '(no name)') + '</span></div>' +
          '<div class="sched-title">' + UI.esc(g.email || '') + '</div>' + state +
          approveBtn + '<button class="btn btn-tiny" data-gdelete="' + g.id + '">Remove</button>' +
        '</div>';
      }).join('');
      UI.$all('[data-gapprove]', wrap).forEach(b => b.addEventListener('click', () => approve(b.getAttribute('data-gapprove'), true)));
      UI.$all('[data-gunapprove]', wrap).forEach(b => b.addEventListener('click', () => approve(b.getAttribute('data-gunapprove'), false)));
      UI.$all('[data-gdelete]', wrap).forEach(b => b.addEventListener('click', () => removeGuest(b.getAttribute('data-gdelete'))));
    } catch (_) { wrap.innerHTML = '<p class="muted">Could not load the guest list.</p>'; }
  }
  async function approve(id, val) {
    const r = await Owner.authFetch('/api/site?action=guest-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id), approved: val }),
    });
    if (r.ok) { UI.toast(val ? 'Approved.' : 'Approval revoked.'); loadAdmin(); }
    else UI.toast('Could not update.');
  }
  async function removeGuest(id) {
    const r = await Owner.authFetch('/api/site?action=guest-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id) }),
    });
    if (r.ok) { UI.toast('Guest removed.'); loadAdmin(); reloadAndRender(); }
    else UI.toast('Could not remove.');
  }

  // ---- oppkobling ----------------------------------------------------------
  function bind() {
    grab();
    const btn = document.getElementById('guest-btn');
    if (btn) btn.addEventListener('click', () => { if (isGuest()) logout(); else open(); });
    const hbtn = document.getElementById('guest-login-btn');
    if (hbtn) hbtn.addEventListener('click', () => { if (isGuest()) logout(); else open(); });
    if (M.submit) M.submit.addEventListener('click', submit);
    if (M.pass) M.pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    if (M.email) M.email.addEventListener('keydown', e => { if (e.key === 'Enter' && mode === 'forgot') submit(); });
    if (M.toggle) M.toggle.addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
    if (M.forgot) M.forgot.addEventListener('click', () => setMode('forgot'));
    if (M.back) M.back.addEventListener('click', () => setMode('login'));
    const close = document.getElementById('guest-modal-close');
    if (close) close.addEventListener('click', () => show(false));
    if (M.overlay) M.overlay.addEventListener('click', e => { if (e.target === M.overlay) show(false); });

    // panel-knapper
    const bA = document.getElementById('gsched-add'); if (bA) bA.addEventListener('click', addSchedule);
    const bU = document.getElementById('gtrack-upload'); if (bU) bU.addEventListener('click', uploadTrack);
    const bS = document.getElementById('gstream-save'); if (bS) bS.addEventListener('click', saveStream);

    // e-postbekreftelse: ?gconfirm=<token>
    const p = new URLSearchParams(location.search);
    const gc = p.get('gconfirm');
    if (gc) {
      post('guest-confirm', { token: gc }).then(({ r, d }) => {
        UI.toast(r.ok ? 'Email confirmed! You can log in now.' : (d.error || 'The confirmation link is invalid.'));
        history.replaceState({}, '', location.pathname);
        if (r.ok) setTimeout(() => open(), 400);
      });
    }
    // glemt passord-lenke: ?greset=<token>
    const gr = p.get('greset');
    if (gr) { resetToken = gr; grab(); status().then(f => { flags = f; setMode('reset'); show(true); }); }

    fillPanel();
  }

  return { bind, render, isGuest, isApproved, token, authFetch, applyVisibility };
})();
