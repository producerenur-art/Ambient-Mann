/* =========================================================================
 * AMBIENT MANN — fellesskaps-chat (flyttbar, åpne/lukke)
 * Alle inne på siden kan chatte og lage sitt eget kallenavn. Sanntid via
 * Gun.js (desentralisert – ingen server nødvendig). Faller tilbake til lokal
 * localStorage-visning hvis Gun ikke er tilgjengelig. Vinduet kan dras rundt,
 * minimeres og lukkes.
 * ========================================================================= */
window.Chat = (function () {
  const NS = 'ambientmann_chat_v1';
  const NICK_KEY = 'am_chat_nick', COLOR_KEY = 'am_chat_color';
  const COLORS = ['#8ab4ff', '#7fe3b0', '#7ee0ff', '#ff9ecb', '#9dffcf', '#ffd479', '#ff8f6b'];

  let gun = null, ref = null, seen = {}, msgs = [], open = false;

  function nick() {
    let n = localStorage.getItem(NICK_KEY);
    if (!n) { n = 'Gjest' + Math.floor(100 + Math.random() * 900); localStorage.setItem(NICK_KEY, n); }
    return n;
  }
  function color() {
    let c = localStorage.getItem(COLOR_KEY);
    if (!c) { c = COLORS[Math.floor(Math.random() * COLORS.length)]; localStorage.setItem(COLOR_KEY, c); }
    return c;
  }

  function initGun() {
    if (!window.Gun) return null;
    try {
      gun = Gun({ peers: (window.AM_CONFIG && AM_CONFIG.gunPeers) || [] });
      ref = gun.get(NS);
      ref.map().on((m, id) => {
        if (!m || seen[id] || !m.text) return;
        seen[id] = true;
        msgs.push({ nick: m.nick || 'Gjest', color: m.color || '#8ab4ff', text: String(m.text).slice(0, 500), ts: m.ts || 0 });
        msgs.sort((a, b) => a.ts - b.ts);
        if (msgs.length > 200) msgs = msgs.slice(-200);
        renderLog();
      });
      return ref;
    } catch (_) { return null; }
  }

  function send() {
    const inp = document.getElementById('chat-text');
    const text = inp && inp.value.trim();
    if (!text) return;
    const msg = { nick: nick(), color: color(), text: text.slice(0, 500), ts: Date.now() };
    if (ref) { ref.set(msg); }
    else {   // fallback: kun lokal visning
      msgs.push(msg); renderLog();
    }
    inp.value = '';
  }

  function renderLog() {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = msgs.map(m =>
      '<div class="chat-msg"><b style="color:' + UI.esc(m.color) + '">' + UI.esc(m.nick) + '</b> ' + UI.esc(m.text) + '</div>'
    ).join('');
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  // ---- vindu: åpne/lukke/minimer/dra --------------------------------------
  function toggle(force) {
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    open = force != null ? force : !open;
    panel.classList.toggle('open', open);
    if (open) { const n = document.getElementById('chat-name'); if (n) n.value = nick(); renderLog(); }
  }

  function makeDraggable() {
    const panel = document.getElementById('chat-panel');
    const head = document.getElementById('chat-head');
    if (!panel || !head) return;
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nx = Math.max(4, Math.min(innerWidth - 60, ox + (e.clientX - sx)));
      const ny = Math.max(4, Math.min(innerHeight - 40, oy + (e.clientY - sy)));
      panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
    });
    head.addEventListener('pointerup', () => { dragging = false; });
  }

  function bind() {
    const fab = document.getElementById('chat-fab');
    if (fab) fab.addEventListener('click', () => toggle());
    const close = document.getElementById('chat-close');
    if (close) close.addEventListener('click', () => toggle(false));
    const send1 = document.getElementById('chat-send');
    if (send1) send1.addEventListener('click', send);
    const text = document.getElementById('chat-text');
    if (text) text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    const name = document.getElementById('chat-name');
    if (name) {
      name.value = nick();
      name.addEventListener('change', () => {
        const v = name.value.trim().slice(0, 24);
        if (v) localStorage.setItem(NICK_KEY, v);
      });
    }
    bindBrowserChoice();
    makeDraggable();
  }

  // ---- Nettleser-valg (kun visuelt: markerer valgt knapp) -----------------
  function bindBrowserChoice() {
    const KEY = 'am_browser_choice';
    const btns = [document.getElementById('browser-mobile'), document.getElementById('browser-desktop')].filter(Boolean);
    if (!btns.length) return;
    const saved = localStorage.getItem(KEY);
    btns.forEach((b) => {
      if (b.dataset.browser === saved) b.classList.add('selected');
      b.addEventListener('click', () => {
        btns.forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        localStorage.setItem(KEY, b.dataset.browser);
      });
    });
  }

  function init() { bind(); initGun(); }

  return { init, toggle, send };
})();
