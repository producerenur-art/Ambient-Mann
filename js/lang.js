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

  // Sett googtrans-cookie og last siden på nytt. Google Translate leser
  // cookien ved oppstart og oversetter automatisk – dette er den robuste
  // veien. Å drive Googles skjulte combo med et syntetisk change-event er
  // upålitelig (combo-en ligger i en display:none-container), så vi gjør
  // det ikke lenger.
  function applyLang(code) {
    setCookie(code ? '/' + PAGE_LANG + '/' + code : '/' + PAGE_LANG + '/' + PAGE_LANG);
    location.reload();
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

  // Merkenavnet skal ALLTID være «Ambient Mann» (to n-er), uansett
  // språk. Google Translate oversetter fane-tittelen og gjør norsk
  // «Mann» → engelsk «Man». Vi retter det opp igjen fortløpende.
  var BRAND_RE = /Ambient Man(?!n)/g;

  function guardTitle() {
    var titleEl = document.querySelector('title');
    if (!titleEl) return;
    function fix() {
      var fixed = document.title.replace(BRAND_RE, 'Ambient Mann');
      if (fixed !== document.title) document.title = fixed;
    }
    fix();
    new MutationObserver(fix).observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // Samme vern for selve siden: Google Translate skriver «Ambient Mann» → «Ambient
  // Man» både inne i tekst-noder (pakket i <font>-tagger) OG i oversettbare
  // attributter (alt/title/placeholder/aria-label) når man bytter språk. Vi går
  // gjennom alt og setter tilbake den andre n-en fortløpende.
  var BRAND_ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];
  function has(s) { BRAND_RE.lastIndex = 0; return BRAND_RE.test(s); }
  function guardBody() {
    if (!document.body) return;
    function fixAttrs(elm) {
      for (var a = 0; a < BRAND_ATTRS.length; a++) {
        var name = BRAND_ATTRS[a];
        if (elm.hasAttribute && elm.hasAttribute(name)) {
          var v = elm.getAttribute(name);
          if (has(v)) elm.setAttribute(name, v.replace(BRAND_RE, 'Ambient Mann'));
        }
      }
    }
    function fixNode(node) {
      if (node.nodeType === 3) {
        if (has(node.nodeValue)) node.nodeValue = node.nodeValue.replace(BRAND_RE, 'Ambient Mann');
      } else if (node.nodeType === 1) {
        fixAttrs(node);
        if (node.childNodes) for (var i = 0; i < node.childNodes.length; i++) fixNode(node.childNodes[i]);
      }
    }
    fixNode(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') fixNode(m.target);
        else if (m.type === 'attributes') { if (m.target.nodeType === 1) fixAttrs(m.target); }
        else for (var j = 0; j < m.addedNodes.length; j++) fixNode(m.addedNodes[j]);
      }
    }).observe(document.body, {
      childList: true, characterData: true, subtree: true,
      attributes: true, attributeFilter: BRAND_ATTRS
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    guardTitle();
    guardBody();
    var sel = byId('lang-picker');
    if (!sel) return;
    var current = langFromCookie();
    fillSelect(sel, SEED, current);
    sel.addEventListener('change', function () { applyLang(sel.value); });
    syncAllLanguages(sel);
  });
})();
