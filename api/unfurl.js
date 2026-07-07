// api/unfurl.js — link-forhåndsvisning for lenker (podcast/web-radio/YouTube).
//
// GET /api/unfurl?url=<lenke>  →  { url, title, image, site, desc, embed }
//
// Henter målsidas HTML server-side (nettleseren får ikke pga. CORS), plukker ut
// Open Graph-metadata og bygger en trygg embed-URL for kjente plattformer
// (SoundCloud / YouTube / Spotify / Bandcamp).
'use strict';

const EMBED_HOSTS = ['w.soundcloud.com', 'www.youtube.com', 'open.spotify.com', 'bandcamp.com'];

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function ogFrom(html) {
  return function (prop) {
    const tag = html.match(new RegExp(
      '<meta[^>]+(?:property|name)=["\']' + prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>', 'i'));
    if (!tag) return '';
    const c = tag[0].match(/content=["']([^"']*)["']/i);
    return c ? decodeEntities(c[1]) : '';
  };
}

function safeHttps(u) {
  const s = decodeEntities(u || '');
  return /^https?:\/\//i.test(s) ? s : '';
}

function buildEmbed(url, og) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  const get = typeof og === 'function' ? og : function () { return ''; };

  if (/(^|\.)soundcloud\.com$/.test(host)) {
    return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=true&hide_related=true&show_comments=false&visual=true&color=%237c3aed';
  }
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') {
    let id = '';
    const m1 = url.match(/[?&]v=([\w-]{6,})/);
    const m2 = url.match(/youtu\.be\/([\w-]{6,})/);
    const m3 = url.match(/\/(?:embed|shorts)\/([\w-]{6,})/);
    id = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || '';
    return id ? 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0' : '';
  }
  if (/(^|\.)spotify\.com$/.test(host)) {
    const m = url.match(/spotify\.com\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    return m ? 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] : '';
  }
  if (/(^|\.)bandcamp\.com$/.test(host)) {
    const v = safeHttps(get('og:video') || get('og:video:secure_url') || get('og:video:url'));
    try { if (v && new URL(v).hostname.replace(/^www\./, '') === 'bandcamp.com') return v; } catch (e) {}
    return '';
  }
  const v = safeHttps(get('og:video') || get('og:video:secure_url'));
  try { if (v && EMBED_HOSTS.indexOf(new URL(v).hostname) !== -1) return v; } catch (e) {}
  return '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = String((req.query && req.query.url) || '').trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2048) {
    return res.status(400).json({ error: 'Ugyldig URL' });
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AmbientMannBot/1.0; +https://www.ambientmann.com)' },
    });
    clearTimeout(t);
    const html = (await r.text()).slice(0, 600000);

    const og = ogFrom(html);
    let site = og('og:site_name');
    if (!site) { try { site = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { site = ''; } }
    const title = og('og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1].trim();

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      url,
      title: title || '',
      image: safeHttps(og('og:image') || og('og:image:secure_url') || og('twitter:image')),
      site: site || '',
      desc: og('og:description') || '',
      embed: buildEmbed(url, og),
    });
  } catch (e) {
    return res.status(200).json({ url, error: 'unfurl_failed' });
  }
};

module.exports.buildEmbed = buildEmbed;
module.exports.ogFrom = ogFrom;
