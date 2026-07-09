// linkpreview.js — gjør delte lenker klikkbare, og setter opp et
// forhåndsvisnings-kort UNDER lenka med cover-bilde fra URL-en + en play-knapp
// som laster inn spilleren (SoundCloud/YouTube/Spotify/Bandcamp m.fl.).
//
// Bildet og embed-URL-en hentes via api/unfurl (server-side OG-/embed-uthenting),
// fordi nettleseren ikke får lese andre nettsteder direkte (CORS).
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  }

  // Plukk ut den 11-tegns YouTube-video-IDen fra alle vanlige lenkeformer.
  function youTubeId(u) {
    const m = String(u || '').match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function linkify(raw) {
    const text = String(raw == null ? '' : raw);
    const urls = [];
    const re = /\bhttps?:\/\/[^\s<]+/gi;
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      let url = m[0];
      let tail = '';
      const t = url.match(/[)\].,!?:;'"»]+$/);
      if (t) { tail = t[0]; url = url.slice(0, url.length - tail.length); }
      urls.push(url);
      out += '<a class="cp-link" href="' + esc(url) +
        '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' + esc(tail);
      last = m.index + m[0].length;
    }
    out += esc(text.slice(last));
    return { html: out, urls: urls };
  }

  function cardHtml(url, key) {
    const u = safeUrl(url);
    if (!u) return '';
    return '<div class="cp-prev" data-lp-idle="1" data-key="' + esc(key) +
      '" data-url="' + esc(u) + '"></div>';
  }

  const _embeds = Object.create(null);

  const PLAY_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

  function hydrate(rootEl) {
    if (typeof document === 'undefined') return;
    const scope = rootEl || document;
    const nodes = scope.querySelectorAll('.cp-prev[data-lp-idle]');
    nodes.forEach(function (el) {
      el.removeAttribute('data-lp-idle');
      const url = el.getAttribute('data-url');
      const key = el.getAttribute('data-key');
      // YouTube: bygg cover-bilde + spiller lokalt fra video-IDen. Da får publikum
      // alltid et forsidebilde, uten å være avhengig av at /api/unfurl svarer.
      const yid = youTubeId(url);
      if (yid) {
        _fill(el, key, url, {
          image: 'https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg',
          embed: 'https://www.youtube.com/embed/' + yid + '?autoplay=1&rel=0',
          site:  'YouTube',
        });
        return;
      }
      fetch('/api/unfurl?url=' + encodeURIComponent(url))
        .then(function (r) { return r.json(); })
        .then(function (d) { _fill(el, key, url, d || {}); })
        .catch(function () { el.remove(); });
    });
  }

  function _fill(el, key, url, d) {
    const img   = safeUrl(d.image);
    const embed = safeUrl(d.embed);
    const title = d.title || '';
    const site  = d.site || '';
    if (!img && !embed && !title) { el.remove(); return; }
    if (embed) _embeds[key] = embed;

    const playBtn = embed
      ? '<button class="cp-prev-play" type="button" aria-label="Spill av" ' +
        'onclick="event.preventDefault();event.stopPropagation();LinkPreview.play(\'' +
        esc(key) + '\')">' + PLAY_SVG + '</button>'
      : '';
    const thumb = img
      ? '<div class="cp-prev-thumb"><img src="' + esc(img) + '" loading="lazy" alt="" ' +
        'onerror="this.parentNode&amp;&amp;this.parentNode.classList.add(\'cp-prev-noimg\');this.remove()">' + playBtn + '</div>'
      : (embed ? '<div class="cp-prev-thumb cp-prev-noimg">' + playBtn + '</div>' : '');

    el.innerHTML =
      '<a class="cp-prev-card" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        thumb +
        '<div class="cp-prev-info">' +
          (site  ? '<div class="cp-prev-site">' + esc(site) + '</div>' : '') +
          (title ? '<div class="cp-prev-title">' + esc(title) + '</div>' : '') +
        '</div>' +
      '</a>';
  }

  function play(key) {
    if (typeof document === 'undefined') return;
    const embed = _embeds[key];
    const el = document.querySelector('.cp-prev[data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (!embed || !el) return;
    const thumb = el.querySelector('.cp-prev-thumb');
    if (!thumb) return;
    thumb.innerHTML = '<iframe src="' + esc(embed) + '" frameborder="0" loading="lazy" ' +
      'allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>';
    el.classList.add('cp-playing');
  }

  const LinkPreview = { linkify: linkify, cardHtml: cardHtml, hydrate: hydrate, play: play, safeUrl: safeUrl };

  if (typeof module !== 'undefined' && module.exports) module.exports = LinkPreview;
  if (typeof window !== 'undefined') window.LinkPreview = LinkPreview;
})(typeof globalThis !== 'undefined' ? globalThis : this);
