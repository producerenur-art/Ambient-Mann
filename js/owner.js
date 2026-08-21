/* =========================================================================
 * AMBIENT MANN — eier-innlogging (KUN Ambient Mann)
 * Ekte innlogging: Ambient Mann oppretter sitt eget passord, logger inn, og
 * kan bruke «Glemt passord?» (e-post-tilbakestilling). Serveren gir et
 * kortlevd HMAC-token som sendes som Bearer på alle privilegerte kall
 * (opplasting, spor, innhold, sendeplan, live-strøm). Live-sending-kontrollene
 * ligger bak denne innloggingen. Klient-siden viser bare .owner-only-UI.
 * ========================================================================= */
window.Owner = (function () {
  const KEY = 'am_owner_token';
  let mode = 'login';     // 'login' | 'create' | 'forgot' | 'reset'
  let resetToken = '';

  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function isOwner() { return !!token(); }
  function save(t) { try { sessionStorage.setItem(KEY, t); } catch (_) {} }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token() });
    return fetch(url, opts);
  }

  function applyVisibility() {
    const on = isOwner();
    UI.$all('.owner-only').forEach(el => { el.style.display = on ? '' : 'none'; });
    const btn = document.getElementById('owner-btn');
    if (btn) btn.textContent = on ? 'Log out' : 'Owner login';
  }

  function refresh() {
    applyVisibility();
    ['Schedule', 'Links', 'Labels', 'Tracks', 'Guest', 'Plays', 'Visits'].forEach(n => { if (window[n] && window[n].render) try { window[n].render(); } catch (_) {} });
  }

  async function post(action, body) {
    const r = await fetch('/api/site?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    const d = await r.json().catch(() => ({}));
    return { r, d };
  }

  async function status() {
    try { const r = await fetch('/api/site?action=owner-status'); return await r.json(); }
    catch (_) { return { hasPassword: false, resetSupported: false, canCreate: false }; }
  }

  // ---- modal ---------------------------------------------------------------
  const M = {};
  function grab() {
    M.overlay = document.getElementById('owner-modal');
    M.title = document.getElementById('owner-modal-title');
    M.sub = document.getElementById('owner-modal-sub');
    M.emailField = document.getElementById('owner-email-field');
    M.email = document.getElementById('owner-email');
    M.passField = document.getElementById('owner-pass-field');
    M.passLabel = document.getElementById('owner-pass-label');
    M.pass = document.getElementById('owner-pass');
    M.submit = document.getElementById('owner-submit');
    M.forgot = document.getElementById('owner-forgot');
    M.back = document.getElementById('owner-back');
  }
  function show(v) { if (M.overlay) M.overlay.classList.toggle('open', v); }

  function setMode(m, opts) {
    mode = m; opts = opts || {};
    const T = {
      login:  ['Owner login', 'For Ambient Mann only.', 'Password', 'Log in'],
      create: ['Create password', 'First time – create your own password (min. 6 characters).', 'New password', 'Create & log in'],
      forgot: ['Forgot password', 'Enter your email and we will send you a reset link.', '', 'Send link'],
      reset:  ['Set new password', 'Choose a new password (min. 6 characters).', 'New password', 'Save & log in'],
    }[m];
    if (M.title) M.title.textContent = T[0];
    if (M.sub) M.sub.textContent = T[1];
    if (M.passLabel) M.passLabel.textContent = T[2];
    if (M.submit) M.submit.textContent = T[3];
    if (M.passField) M.passField.style.display = (m === 'forgot') ? 'none' : '';
    if (M.emailField) M.emailField.style.display = (m === 'forgot' || m === 'create') ? '' : 'none';
    if (M.forgot) M.forgot.style.display = (m === 'login' && opts.resetSupported) ? '' : 'none';
    if (M.back) M.back.style.display = (m === 'forgot') ? '' : 'none';
    if (M.pass) M.pass.value = '';
  }

  async function open() {
    const s = await status();
    setMode(s.canCreate ? 'create' : 'login', { resetSupported: s.resetSupported });
    show(true);
    if (M.pass) M.pass.focus();
  }

  async function submit() {
    const pass = (M.pass && M.pass.value) || '';
    const email = (M.email && M.email.value.trim()) || '';
    if (mode === 'login') {
      const { r, d } = await post('login', { password: pass });
      if (r.status === 503) return UI.toast(d.error || 'Login is not set up yet.');
      if (r.ok && d.token) { save(d.token); show(false); refresh(); UI.toast('Logged in.'); }
      else UI.toast(d.error || 'Wrong password.');
    } else if (mode === 'create') {
      if (pass.length < 6) return UI.toast('At least 6 characters.');
      const { r, d } = await post('set-password', { password: pass, email: email });
      if (r.ok && d.token) { save(d.token); show(false); refresh(); UI.toast('Password created – you are logged in.'); }
      else UI.toast(d.error || 'Could not create password.');
    } else if (mode === 'forgot') {
      if (!email) return UI.toast('Enter your email.');
      await post('forgot', { email: email });
      show(false);
      UI.toast('If the email matches, a reset link has been sent.');
    } else if (mode === 'reset') {
      if (pass.length < 6) return UI.toast('At least 6 characters.');
      const { r, d } = await post('reset', { token: resetToken, password: pass });
      if (r.ok && d.token) {
        save(d.token); show(false); refresh(); UI.toast('New password saved – you are logged in.');
        history.replaceState({}, '', location.pathname);
      } else UI.toast(d.error || 'The link is invalid or has expired.');
    }
  }

  function logout() { try { sessionStorage.removeItem(KEY); } catch (_) {} refresh(); UI.toast('Logged out.'); }

  function bind() {
    grab();
    const btn = document.getElementById('owner-btn');
    if (btn) btn.addEventListener('click', () => { if (isOwner()) logout(); else open(); });
    if (M.submit) M.submit.addEventListener('click', submit);
    if (M.pass) M.pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    if (M.forgot) M.forgot.addEventListener('click', () => setMode('forgot'));
    if (M.back) M.back.addEventListener('click', () => setMode('login', { resetSupported: true }));
    const close = document.getElementById('owner-modal-close');
    if (close) close.addEventListener('click', () => show(false));
    if (M.overlay) M.overlay.addEventListener('click', e => { if (e.target === M.overlay) show(false); });

    // Reset-lenke fra e-post: ?reset=<token>
    const p = new URLSearchParams(location.search);
    const rt = p.get('reset');
    if (rt) { resetToken = rt; setMode('reset'); show(true); }

    applyVisibility();
  }

  return { login: submit, logout, isOwner, token, authFetch, applyVisibility, bind, refresh };
})();
