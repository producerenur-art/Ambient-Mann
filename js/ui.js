/* =========================================================================
 * AMBIENT MANN — små UI-hjelpere (toast, ikoner, escaping)
 * Gir de gjenbrukte modulene (chat/linkpreview) et lite felles grunnlag,
 * uten hele SoundCore-appen bak seg.
 * ========================================================================= */
window.UI = (function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = document.getElementById('toast');
    if (!el) { console.log('[toast]', msg); return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 3600);
  }

  // Enkelt emoji-ikonsett (chat.js/andre kaller Icon()).
  const ICONS = {
    play: '▶', pause: '⏸', live: '🔴', chat: '💬', close: '×',
    music: '♪', star: '✦', mail: '✉', heart: '♥', link: '🔗', upload: '⬆',
  };
  function Icon(name) { return ICONS[name] || '✦'; }

  return { $, $all, esc, toast, Icon };
})();
// Bakoverkompatible globaler enkelte moduler forventer.
window.Icon = window.UI.Icon;
