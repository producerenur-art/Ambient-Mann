/* =============================================================
 * SPRÅKVELGER — brukeren velger språk selv (Google Translate).
 * Oversetter HELE siden til alle språk Google støtter (~130),
 * uten egen i18n. Valget lagres i cookie og overlever sidelast.
 * ============================================================= */
(function () {
  'use strict';

  var PAGE_LANG = 'no';

  // Vises umiddelbart (før Googles combo er klar). Når Google er
  // lastet fyller vi inn ALLE språk Google støtter i tillegg.
  var SEED = [
    ['',      'Norsk (original)'],
    ['en',    'English'],
    ['sv',    'Svenska'],
    ['da',    'Dansk'],
    ['de',    'Deutsch'],
    ['fr',    'Français'],
    ['es',    'Español'],
    ['pt',    'Português'],
    ['it',    'Italiano'],
    ['nl',    'Nederlands'],
    ['pl',    'Polski'],
    ['ru',    'Русский'],
    ['ja',    '日本語'],
    ['ko',    '한국어'],
    ['zh-CN', '中文'],
    ['ar',    'العربية'],
    ['hi',    'हिन्दी']
  ];

  function byId(id) { return document.getElementById(id); }

  // --- cookie: får valgt språk til å overleve sidelast ---
  function setCookie(val) {
    var host = location.hostname;
    var base = host.replace(/^www\./, '');
    var domains = ['', host];
    if (base !== host) domains.push('.' + base);
    domains.push('.' + host);
    domains.forEach(function (d) {
      var c = 'googtrans=' + val + ';path=/;max-age=31536000';
      if (d) c += ';domain=' + d;
      document.cookie = c;
    });
  }
  function langFromCookie() {
    var m = document.cookie.match(/googtrans=\/[^/]*\/([^;]+)/);
    var code = m ? decodeURIComponent(m[1]) : '';
    return code === PAGE_LANG ? '' : code;
  }

  function fillSelect(sel, list, current) {
    sel.innerHTML = '';
    list.forEach(function (pair) {
      var o = document.createElement('option');
      o.value = pair[0];
      o.textContent = pair[1];
      o.className = 'notranslate';
      if (pair[0] === current) o.selected = true;
      sel.appendChild(o);
    });
  }

  // Driv Googles skjulte combo → oversetter siden uten reload.
  function applyLang(code) {
    setCookie(code ? '/' + PAGE_LANG + '/' + code : '/' + PAGE_LANG + '/' + PAGE_LANG);
    var combo = document.querySelector('.goog-te-combo');
    if (combo) {
      combo.value = code;
      combo.dispatchEvent(new Event('change'));
      // Tilbake til original er mest robust med en frisk last.
      if (!code) location.reload();
    } else if (code) {
      // Google ikke lastet ennå: cookie er satt, en reload tar oversettelsen.
      location.reload();
    }
  }

  // Kopier ALLE språk fra Googles combo inn i vår egen select.
  function syncAllLanguages(sel) {
    var tries = 0;
    var iv = setInterval(function () {
      var combo = document.querySelector('.goog-te-combo');
      if (combo && combo.options.length > 1) {
        clearInterval(iv);
        var current = sel.value;
        var list = [['', 'Norsk (original)']];
        Array.prototype.forEach.call(combo.options, function (op) {
          if (op.value) list.push([op.value, op.textContent]);
        });
        fillSelect(sel, list, current);
      } else if (++tries > 60) {
        clearInterval(iv);
      }
    }, 250);
  }

  // Google kaller denne når element.js er ferdig lastet.
  window.amGoogleTranslateInit = function () {
    /* global google */
    new google.translate.TranslateElement({
      pageLanguage: PAGE_LANG,
      autoDisplay: false,
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, 'google_translate_element');
  };

  document.addEventListener('DOMContentLoaded', function () {
    var sel = byId('lang-picker');
    if (!sel) return;
    var current = langFromCookie();
    fillSelect(sel, SEED, current);
    sel.addEventListener('change', function () { applyLang(sel.value); });
    syncAllLanguages(sel);
  });
})();
