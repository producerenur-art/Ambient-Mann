/* =========================================================================
 * AMBIENT MANN — små UI-hjelpere (toast, ikoner, escaping)
 * Gir de gjenbrukte modulene (linkpreview m.fl.) et lite felles grunnlag,
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

  // Beskytt merkenavnet «Ambient Mann» mot Google Translate («Mann» → «Male»).
  // Kjøres PÅ allerede escaped tekst — spennet som legges til er statisk/trygt.
  function brandSafe(escaped) {
    return String(escaped).replace(/Ambient Mann/g,
      '<span translate="no" class="notranslate">Ambient Mann</span>');
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

  // Enkelt emoji-ikonsett (modulene kaller Icon()).
  const ICONS = {
    play: '▶', pause: '⏸', live: '🔴', close: '×',
    music: '♪', star: '✦', mail: '✉', heart: '♥', link: '🔗', upload: '⬆',
  };
  function Icon(name) { return ICONS[name] || '✦'; }

  return { $, $all, esc, brandSafe, toast, Icon };
})();
// Bakoverkompatible globaler enkelte moduler forventer.
window.Icon = window.UI.Icon;
