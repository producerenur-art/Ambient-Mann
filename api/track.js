// api/track.js — dedikert delbar side per opplasting: /track/<id>
//
//   GET /track/<id>  (via rewrite → /api/track?id=<id>)
//   → en egen HTML-side for ett spor, med Open Graph / Twitter-metadata slik at
//     lenka viser et pent kort (cover + tittel) når den deles på andre nettsteder,
//     og en spiller som prøver autoplay + starter på første trykk.
'use strict';

let createClient = null;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) {}

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !createClient) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function safeHttps(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
// Lag en pen URL-bit av tittelen: «All The Way From Heaven 017» → «all-the-way-from-heaven-017».
function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Plateselskaper – standardliste (samme som js/config.js labelsDefault).
// Brukes som reserve hvis eieren ikke har lagret en egen 'labels'-liste ennå.
// Når eieren legger til/fjerner plateselskaper på forsiden, lagres det under
// nøkkelen 'labels' og vises automatisk her på hver spor-side også.
const DEFAULT_LABELS = [
  { name: 'Mike La Bella Records', url: 'https://mikelabellarecords.bandcamp.com/' },
  { name: 'Cosmic Leaf Records', url: 'https://cosmicleaf.bandcamp.com/' },
  { name: 'Altar Records', url: 'https://altar.bandcamp.com/' },
  { name: 'Ultimae Records', url: 'https://ultimae.bandcamp.com/' },
  { name: 'Cryo Chamber', url: 'https://cryochamber.bandcamp.com/' },
  { name: 'Sofa Beats Music', url: 'https://sofabeatsmusic.bandcamp.com/' },
  { name: 'Synchronos Recordings', url: 'https://synchronos-recordings.bandcamp.com/album/subspace-garden' },
  { name: 'Merkaba Music', url: 'https://merkabamusic1.bandcamp.com/' },
  { name: 'Zenon Records', url: 'https://zenonrecords.bandcamp.com/' },
  { name: 'Interchill Records', url: 'https://interchill.bandcamp.com/' },
  { name: 'Chillhop Music', url: 'https://chillhop.bandcamp.com/' },
  { name: 'Blue Tunes Chillout', url: 'https://bluetuneschillout.bandcamp.com/' },
  { name: 'Microcosmos', url: 'https://microcosmos.bandcamp.com/' },
  { name: 'Dungeon Synth & Dark Ambient', url: 'https://dungeonsynthdarkambient.bandcamp.com/' },
  { name: 'Mystic Sound', url: 'https://mysticsound.bandcamp.com/' },
];
function normLabels(v) {
  if (!Array.isArray(v)) return null;
  const out = v.map(function (x) {
    if (typeof x === 'string') return { name: '', url: x };
    return x && typeof x === 'object' ? { name: String(x.name || ''), url: String(x.url || '') } : null;
  }).filter(function (x) { return x && /^https?:\/\//i.test(x.url); });
  return out.length ? out : null;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.ambientmann.com';
  const origin = proto + '://' + host;

  let track = null;
  let labelList = DEFAULT_LABELS;
  let linkList = [];
  try {
    const c = sb();
    if (c) {
      const { data } = await c.from('site_content').select('key,data').in('key', ['tracks', 'labels', 'links']);
      const rows = {}; (data || []).forEach(r => { rows[r.key] = r.data; });
      const arr = Array.isArray(rows.tracks) ? rows.tracks : [];
      const want = slugify(id);
      // Nye lenker: pen tittel-slug (/track/all-the-way-from-heaven-017).
      // Gamle lenker: rå id (/track/t_xxxx) fungerer fortsatt.
      track = arr.find(t => t && String(t.id) === id)
           || arr.find(t => t && slugify(t.title) === want && want)
           || null;
      // Eierens lagrede plateselskaper (hvis satt) – ellers standardlista.
      labelList = normLabels(rows.labels) || DEFAULT_LABELS;
      // Eierens lagrede lenker (podcast/web-radio o.l.) – vises i egen seksjon
      // her på spor-siden, så «Lenker» i toppmenyen kan bli på samme side.
      linkList = normLabels(rows.links) || [];
    }
  } catch (_) {}

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');

  // Ukjent/slettet spor → send folk pent tilbake til hovedsida.
  if (!track || !safeHttps(track.url)) {
    res.statusCode = 404;
    return res.end('<!doctype html><meta charset="utf-8">' +
      '<meta http-equiv="refresh" content="0;url=' + esc(origin) + '/">' +
      '<title>Ambient Mann</title>');
  }

  const rawTitle = track.title || 'Spor';
  const title = esc(rawTitle);
  const cover = safeHttps(track.coverUrl);
  const audioUrl = safeHttps(track.url);
  // Kanonisk URL = pen tittel-slug (faller tilbake til id hvis tittelen ikke gir slug).
  const slug = slugify(track.title) || String(track.id);
  const pageUrl = origin + '/podcast/' + slug;
  const desc = 'Hør «' + rawTitle + '» hos Ambient Mann.';

  const meta = [
    '<meta property="og:type" content="music.song">',
    '<meta property="og:site_name" content="Ambient Mann">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:url" content="' + esc(pageUrl) + '">',
    cover ? '<meta property="og:image" content="' + esc(cover) + '">' : '',
    '<meta property="og:audio" content="' + esc(audioUrl) + '">',
    '<meta property="og:audio:type" content="audio/mpeg">',
    '<meta name="twitter:card" content="' + (cover ? 'summary_large_image' : 'summary') + '">',
    '<meta name="twitter:title" content="' + title + '">',
    '<meta name="twitter:description" content="' + esc(desc) + '">',
    cover ? '<meta name="twitter:image" content="' + esc(cover) + '">' : '',
  ].filter(Boolean).join('\n');

  const coverStyle = cover ? "background-image:url('" + esc(cover) + "')" : '';

  // Toppmeny – samme valg som forsiden (index.html .nav). Her på spor-sidene
  // peker Donasjon / Lenker / Plateselskaper på seksjoner LENGER NEDE på DENNE
  // siden (anker på samme side), slik at man blir værende på sporets URL i
  // stedet for å bli sendt til forsiden.
  // Toppmenyen på spor-sidene: Hjem + Donasjon/Lenker/Plateselskaper (som peker
  // på seksjoner lenger nede på DENNE siden). Om, Kontakt og «Send booking» hører
  // kun hjemme på forsiden, så de er bevisst utelatt her.
  const navItems = [
    ['Donasjon', '#donasjon', ''],
    ['Lenker', '#links', ''],
    ['Plateselskaper', '#plateselskaper', ''],
  ];
  const nav = '<a href="/" class="topnav-home">⌂ Hjem</a>' +
    navItems.map(function (n) {
      var cls = n[2] ? ' class="' + n[2] + '"' : '';
      return '<a href="' + esc(n[1]) + '"' + cls + '>' + esc(n[0]) + '</a>';
    }).join('');

  // Om Ambient Mann – samme innhold som forsidens Om-modal, vist i en overlay
  // her på hver spor-side også (spor-sidene har ingen oversetter-widget, så
  // teksten vises som skrevet).
  const aboutInner =
    '<button class="x" aria-label="Lukk">×</button>' +
    '<h3>Om<span>&nbsp;Ambient Mann</span></h3>' +
    '<p>Noah Kristiansen has been working professionally with podcasts for over 15 years. Born in Greenland in 1982, he later moved to Norway.</p>' +
    '<p>Following a revelation regarding music and podcast production at the age of 14 (Back Then it Only Was A Dream), Noah <span translate="no">FeedFreq</span> reached out to channels such as <a translate="no" href="https://diceradio.gr/" target="_blank" rel="noopener">diceradio.gr</a> and <a translate="no" href="https://radioq37.com/" target="_blank" rel="noopener">Radioq37.com</a> in 2014. Shortly thereafter, he began meditating and producing podcasts. He subsequently experienced a new revelation on a level of spiritual consciousness and suddenly became part of Tree of Life / BM Bookings—an agency now known as <span translate="no">FeedFreq &amp; BigFreq</span>. Since 2014, he has established collaborations with numerous entities, including Mikelabella Records, Cryo Chamber, Cosmicleaf Records, Trancentral, Psybient.org, IT Athens, and others.</p>' +
    '<p>Through the series &ldquo;All The Way From Heaven,&rdquo; he aims to unite musical frequencies with spiritual frequencies, thereby creating and spreading good vibrations to us all.</p>' +
    '<p>Thanks to all the talented artists and record labels out there!</p>' +
    '<p>And thanks to the Creator of the universe for opening our inner guidance system—a connection between the soul, the physical world, and the divine source.</p>' +
    '<p>In this way, he seeks to draw spiritual strength—not only for himself but for everyone.</p>' +
    '<p class="about-verse">A journey with Noah&rsquo;s Ark—<br>&ldquo;All The Way From Heaven&rdquo; by <span translate="no">Ambient Mann</span><br>You will not go down with the ship.</p>' +
    '<p>With the right preparation, there is no shock reaction; there is only affirmation. Even events that might otherwise seem shocking will not overwhelm you. They may catch you off guard or cause a moment of unease, but they will not overwhelm you. You will not be paralyzed by the situation or frozen in fear, unable to figure out what to do.</p>' +
    '<p>(<a translate="no" href="https://www.stepstoknowledge.com/" target="_blank" rel="noopener">www.stepstoknowledge.com</a>)</p>' +
    '<p>When the ship starts to list and take on water, you will be ready. You will not freeze up. You will not go down with the ship. Contact <span translate="no">Ambient Mann</span> at: <a translate="no" href="mailto:aon_h@mailfence.com">aon_h@mailfence.com</a></p>' +
    '<p>Booking: <a translate="no" href="mailto:yaniv@bigfreq.com">yaniv@bigfreq.com</a></p>' +
    '<p>Our websites:</p>' +
    '<ul class="about-links">' +
    '<li><a translate="no" href="https://feedfreq.com/" target="_blank" rel="noopener">https://feedfreq.com/</a></li>' +
    '<li><a translate="no" href="http://bigfreq.com/" target="_blank" rel="noopener">http://bigfreq.com/</a></li>' +
    '<li><a translate="no" href="https://soundcloud.com/feedfreq" target="_blank" rel="noopener">https://soundcloud.com/feedfreq</a></li>' +
    '<li><a translate="no" href="https://www.ambientmann.com/" target="_blank" rel="noopener">https://www.ambientmann.com/</a></li>' +
    '</ul>' +
    '<p class="muted">This email is &ldquo;Out Of Bounds&rdquo; &ndash; <a translate="no" href="mailto:noah@radioq37.com">noah@radioq37.com</a></p>';

  // Sosiale delelenker (server-beregnet, samme URL som deles).
  const eu = encodeURIComponent(pageUrl);
  const shareText = 'Hør «' + rawTitle + '» hos Ambient Mann';
  const et = encodeURIComponent(shareText);
  const social = [
    ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + eu],
    ['X', 'https://twitter.com/intent/tweet?url=' + eu + '&text=' + et],
    ['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + pageUrl)],
    ['Telegram', 'https://t.me/share/url?url=' + eu + '&text=' + et],
    ['E-post', 'mailto:?subject=' + encodeURIComponent(rawTitle) + '&body=' + encodeURIComponent(shareText + '\n\n' + pageUrl)],
  ].map(function (s) { return '<a class="soc" target="_blank" rel="noopener" href="' + esc(s[1]) + '">' + esc(s[0]) + '</a>'; }).join('');

  // Plateselskaper (kun navn, direkte lenke – ingen overskrift), som på forsiden.
  const labels = labelList.map(function (l) {
    return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name || l.url) + ' ↗</a>';
  }).join('');

  // Lenker (podcast / web-radio / SoundCloud o.l.) – eierens lagrede lenker, vist
  // som navn → URL, slik at «Lenker» i toppmenyen kan peke hit på samme side.
  const links = linkList.map(function (l) {
    return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name || l.url) + ' ↗</a>';
  }).join('');
  const linksSection = links
    ? '<section class="link-section" id="links"><h2 class="section-h">Lenker</h2>' +
      '<div class="labels">' + links + '</div></section>'
    : '';

  // Bunn-logoer – samme rekke som forsiden (index.html .logo-strip), så den
  // følger med på alle spor-sider (/track/...). Bildene ligger på samme domene.
  const LOGOS = [
    ['https://feedfreq.com/', '/assets/feedfreq-site.png', 'FeedFreq — feedfreq.com', 'FeedFreq'],
    ['https://app.bigfreq.com/communities/groups/feedfreq-public/home', '/assets/feedfreq-logo.png', 'FeedFreq', 'FeedFreq'],
    ['https://soundcloud.com/feedfreq', '/assets/soundcloud-logo.svg', 'SoundCloud — feedfreq', 'SoundCloud'],
    ['https://www.psybient.org/', '/assets/psybient-logo.png', 'psybient.org', 'psybient.org'],
    ['https://diceradio.gr/', '/assets/diceradio-logo.png', 'Dice Radio', 'Dice Radio'],
    ['https://trancentral.tv/', '/assets/trancentral-logo.png', 'Trancentral', 'Trancentral'],
    ['https://ra.co/clubs/212119', '/assets/it-athens-logo.png', 'IT Athens — Wake the Beat', 'IT Athens'],
    ['https://www.newmessage.org/', '/assets/newmessage-logo.png', 'The New Message From God', 'The New Message From God'],
    ['https://www.siriusfm.no/', '/assets/siriusfm.jpg', 'SiriusFM', 'SiriusFM'],
  ];
  const logoStrip = LOGOS.map(function (g) {
    return '<a class="brand-logo" target="_blank" rel="noopener" title="' + esc(g[2]) + '" href="' + esc(g[0]) + '">' +
      '<img src="' + esc(g[1]) + '" alt="' + esc(g[3]) + '"></a>';
  }).join('');

  // Donasjon (frivillig) – samme sammenleggbare blokk som nederst på forsiden,
  // så folk kan støtte Ambient Mann direkte fra hver spor-side også. Vipps
  // åpner appen mot mottakernummeret; kort går via /api/create-checkout (Stripe),
  // som sender tilbake til forsiden med takke-melding etter fullført betaling.
  const vippsNumber = '97253713';
  const vippsHref = 'https://qr.vipps.no/28/2/03/031/' + encodeURIComponent(vippsNumber);
  const donation =
    '<section class="don-block" id="donasjon">' +
    '<details class="don-details">' +
    '<summary class="don-summary"><h2>Donasjon</h2><span class="don-toggle" aria-hidden="true"></span></summary>' +
    '<div class="don-card">' +
    '<div class="don-presets">' +
    '<button class="don-preset" type="button" data-kr="100">100 kr</button>' +
    '<button class="don-preset" type="button" data-kr="200">200 kr</button>' +
    '<button class="don-preset" type="button" data-kr="500">500 kr</button>' +
    '</div>' +
    '<div class="don-custom"><label for="don-amount">Beløp (kr)</label>' +
    '<input id="don-amount" type="number" min="20" max="10000" value="100"></div>' +
    '<div class="don-actions">' +
    '<button class="btn btn-primary" type="button" id="don-stripe">💳 Doner med kort</button>' +
    '<a class="btn btn-vipps" id="don-vipps" href="' + esc(vippsHref) + '" target="_blank" rel="noopener">Doner med Vipps</a>' +
    '</div>' +
    '<div class="don-qr"><a href="' + esc(vippsHref) + '" target="_blank" rel="noopener">' +
    '<img src="/assets/vipps-qr.png" alt="Vipps-QR – doner til Ambient Mann" width="160" height="160" loading="lazy"></a>' +
    '<p class="don-qr-cap">Skann med mobilen for å donere via Vipps</p></div>' +
    '<p class="don-note">Vipps åpnes automatisk med riktig mottaker (<span translate="no">Ambient Mann</span>).</p>' +
    '</div></details></section>';

  const html = '<!doctype html>\n<html lang="no" translate="no">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    // Skru av Chrome/Google sitt AUTOMATISKE oversettelses-tilbud (samme som forsiden).
    '<meta name="google" content="notranslate">\n' +
    '<title>' + title + ' · Ambient Mann</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<link rel="canonical" href="' + esc(pageUrl) + '">\n' +
    meta + '\n' +
    '<style>\n' +
    ':root{--bg:#04060f;--panel:rgba(16,20,38,.72);--line:rgba(140,160,255,.18);--text:#eaf0ff;--muted:#9aa6cf;--accent:#8ab4ff;--accent2:#7fe3b0}\n' +
    '*{box-sizing:border-box}\n' +
    'body{margin:0;min-height:100vh;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--text);\n' +
    '  background:radial-gradient(1200px 800px at 50% -10%,rgba(138,180,255,.14),transparent),var(--bg);\n' +
    '  display:flex;align-items:center;justify-content:center;padding:72px 24px 24px}\n' +
    // Samme bevegelige stjernehimmel som på forsiden (bak innholdet).
    '#starfield{position:fixed;inset:0;z-index:-2;pointer-events:none}\n' +
    // Toppmeny – samme lenker som forsiden, festet øverst over stjernene.
    '.topbar{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;justify-content:center;\n' +
    '  padding:14px 16px;backdrop-filter:blur(6px);background:linear-gradient(180deg,rgba(4,6,15,.6),transparent)}\n' +
    '.topnav{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}\n' +
    '.topnav a{color:var(--text);font-weight:700;font-size:14px;text-decoration:none;padding:8px 12px;\n' +
    '  border-radius:10px;text-shadow:0 2px 14px rgba(2,4,12,.85),0 0 4px rgba(2,4,12,.7)}\n' +
    '.topnav a:hover{color:var(--accent);background:rgba(24,28,52,.5)}\n' +
    // Booking-knapp – tydelig grønn/accent-pille (samme CTA som forsiden).
    '.topnav a.topnav-book{background:linear-gradient(135deg,var(--accent),var(--accent2));\n' +
    '  color:#0a0f2a;text-shadow:none}\n' +
    '.topnav a.topnav-book:hover{color:#0a0f2a;filter:brightness(1.05)}\n' +
    // Språkvelger (Google Translate) – samme som forsiden, festet øverst til høyre.
    '.topbar-lang{position:fixed;top:10px;right:12px;z-index:6}\n' +
    '.lang-picker{background:rgba(16,20,38,.9);color:var(--text);border:1px solid var(--line);\n' +
    '  border-radius:12px;padding:9px 12px;font-weight:600;font-size:14px;cursor:pointer;\n' +
    '  max-width:160px;appearance:none;-webkit-appearance:none}\n' +
    '.lang-picker:hover{border-color:var(--accent)}\n' +
    '.lang-picker option{background:#0a0f2a;color:var(--text)}\n' +
    // Skjul Googles egen widget-UI (banner/tooltip/uthevning) – vi bruker vår egen.
    '#google_translate_element{display:none}\n' +
    '.goog-te-banner-frame,.goog-te-gadget-icon,#goog-gt-tt,.goog-tooltip,.goog-tooltip *{display:none !important}\n' +
    '.VIpgJd-ZVi9od-ORHb-OEVmcd,body>.skiptranslate{display:none !important}\n' +
    '.goog-te-gadget{height:0;overflow:hidden}\n' +
    'body{top:0 !important}\n' +
    '.goog-text-highlight{background:none !important;box-shadow:none !important}\n' +
    // Om Ambient Mann – overlay-modal (samme innhold som forsiden).
    '.about-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;\n' +
    '  background:rgba(2,4,12,.82);backdrop-filter:blur(6px);padding:18px}\n' +
    '.about-ov.open{display:flex}\n' +
    '.about-box{position:relative;width:100%;max-width:600px;max-height:82vh;overflow-y:auto;text-align:left;\n' +
    '  background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:26px 22px;box-shadow:0 20px 60px rgba(0,0,0,.5)}\n' +
    '.about-box h3{margin:0 0 14px;font-size:20px}\n' +
    '.about-box p{margin:0 0 12px;line-height:1.6;color:var(--text)}\n' +
    '.about-box a{color:var(--accent);word-break:break-word}\n' +
    '.about-box .about-verse{font-style:italic;color:var(--accent)}\n' +
    '.about-box .about-links{list-style:none;padding:0;margin:0 0 12px;display:flex;flex-direction:column;gap:6px}\n' +
    '.about-box .muted{color:var(--muted)}\n' +
    '.about-box .x{position:absolute;top:8px;right:12px;background:none;border:0;color:var(--muted);\n' +
    '  font-size:26px;line-height:1;cursor:pointer}\n' +
    '.about-box .x:hover{color:var(--accent)}\n' +
    'body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;\n' +
    '  background:radial-gradient(120% 80% at 50% 0%,rgba(0,0,0,0) 40%,rgba(2,4,12,.72) 100%)}\n' +
    // Ingen boks/skygge bak teksten – universet skal synes gjennom.
    '.card{width:100%;max-width:420px;background:transparent;border:0;border-radius:20px;padding:22px;text-align:center;box-shadow:none}\n' +
    // Lett tekst-skygge kun for lesbarhet over stjernene (ingen boks).
    '.brand,h1,.hint,.labels a{text-shadow:0 2px 14px rgba(2,4,12,.85),0 0 4px rgba(2,4,12,.7)}\n' +
    // Plateselskaper – bare navn som lenker, stjernene synes rett bak.
    '.labels{display:flex;flex-direction:column;gap:9px;margin-top:20px}\n' +
    '.labels a{color:var(--accent);font-weight:700;font-size:15px;text-decoration:none}\n' +
    '.labels a:hover{text-decoration:underline}\n' +
    // Lenker-seksjon (egen overskrift, ellers samme lenkestil som plateselskaper).
    '.link-section{margin-top:20px}\n' +
    '.link-section .labels{margin-top:12px}\n' +
    '.section-h{font-size:16px;margin:0;color:var(--text)}\n' +
    // Anker-mål (toppmeny-valgene) – hopp litt lenger ned så den faste
    // toppmenyen ikke dekker toppen av seksjonen når man ruller dit.
    '#donasjon,#links,#plateselskaper{scroll-margin-top:80px}\n' +
    '.cover{width:220px;height:220px;max-width:70vw;max-height:70vw;margin:0 auto 18px;border-radius:16px;\n' +
    '  background:#0a0f2a center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:64px;color:rgba(140,160,255,.5)}\n' +
    '.brand{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}\n' +
    'h1{font-size:22px;margin:0 0 18px;word-wrap:break-word}\n' +
    'audio{width:100%;margin:0 0 8px}\n' +
    '.hint{font-size:13px;color:var(--muted);min-height:18px;margin:0 0 16px}\n' +
    '.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}\n' +
    '.btn{padding:11px 16px;border-radius:12px;border:1px solid var(--line);background:rgba(24,28,52,.6);color:var(--text);\n' +
    '  font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}\n' +
    '.btn:hover{border-color:var(--accent)}\n' +
    '.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#0a0f2a;border:0}\n' +
    '.social{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}\n' +
    '.soc{font-size:13px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:7px 13px;text-decoration:none}\n' +
    '.soc:hover{color:var(--accent);border-color:var(--accent)}\n' +
    '.back{display:inline-block;margin-top:16px;color:var(--muted);font-size:13px}\n' +
    // Bunn-logoer – samme rekke som forsiden, tilpasset det smalere kortet.
    '.logo-strip{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:center;\n' +
    '  margin-top:26px;padding-top:20px;border-top:1px solid var(--line)}\n' +
    '.brand-logo{display:inline-flex;opacity:.82;transition:opacity .2s,transform .2s}\n' +
    '.brand-logo:hover{opacity:1;transform:translateY(-2px)}\n' +
    '.brand-logo img{height:40px;width:auto;max-width:96px;object-fit:contain;border-radius:8px}\n' +
    // Donasjon – sammenleggbar blokk nederst, samme stil som forsiden.
    '.don-block{width:100%;max-width:420px;margin:26px auto 0;padding-top:20px;border-top:1px solid var(--line)}\n' +
    '.don-details{text-align:left}\n' +
    '.don-summary{display:flex;align-items:center;justify-content:center;gap:12px;cursor:pointer;\n' +
    '  list-style:none;user-select:none}\n' +
    '.don-summary::-webkit-details-marker{display:none}\n' +
    '.don-summary h2{font-size:20px;margin:0}\n' +
    '.don-toggle{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;\n' +
    '  border-radius:8px;border:1px solid var(--line);background:rgba(24,28,52,.6);color:var(--text);\n' +
    '  font-size:16px;line-height:1;font-weight:700}\n' +
    '.don-toggle::before{content:"+"}\n' +
    '.don-details[open] .don-toggle::before{content:"–"}\n' +
    '.don-summary:hover .don-toggle{border-color:var(--accent)}\n' +
    '.don-card{margin-top:14px}\n' +
    '.don-presets{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:12px}\n' +
    '.don-preset{padding:10px 16px;border-radius:11px;border:1px solid var(--line);\n' +
    '  background:rgba(24,28,52,.6);color:var(--text);font-weight:700;cursor:pointer}\n' +
    '.don-preset.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#0a0f2a;border:0}\n' +
    '.don-custom{max-width:220px;margin:0 auto}\n' +
    '.don-custom label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}\n' +
    '.don-custom input{width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);\n' +
    '  background:rgba(16,20,38,.72);color:var(--text);font-size:15px}\n' +
    '.don-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:14px}\n' +
    '.btn-vipps{background:#ff5b24;color:#fff;border:0}\n' +
    '.don-qr{margin-top:16px;text-align:center}\n' +
    '.don-qr img{display:block;margin:0 auto;width:160px;height:160px;border-radius:12px;\n' +
    '  background:#fff;padding:8px;border:1px solid var(--line)}\n' +
    '.don-qr-cap{margin:8px 0 0;font-size:13px;color:var(--muted)}\n' +
    '.don-note{font-size:13px;color:var(--muted);margin-top:12px;text-align:center}\n' +
    '</style>\n</head>\n<body>\n' +
    '<canvas id="starfield"></canvas>\n' +
    '<header class="topbar"><nav class="topnav">' + nav + '</nav></header>\n' +
    // Språkvelger – oversetter hele siden (standard: engelsk), samme som forsiden.
    '<div class="topbar-lang"><select id="lang-picker" class="lang-picker notranslate" translate="no" aria-label="Velg språk / Choose language"></select></div>\n' +
    '<div id="google_translate_element" aria-hidden="true"></div>\n' +
    '<div class="about-ov" id="about-ov"><div class="about-box" translate="no">' + aboutInner + '</div></div>\n' +
    '<main class="card">\n' +
    '  <div class="cover" style="' + coverStyle + '">' + (cover ? '' : '♪') + '</div>\n' +
    '  <p class="brand" translate="no">Ambient Mann</p>\n' +
    '  <h1>' + title + '</h1>\n' +
    '  <audio id="a" controls controlsList="nodownload noplaybackrate" disablePictureInPicture autoplay playsinline preload="auto" src="' + esc(audioUrl) + '"></audio>\n' +
    '  <p class="hint" id="hint"></p>\n' +
    '  <div class="row">\n' +
    '    <button class="btn btn-primary" id="share">Del</button>\n' +
    '    <button class="btn" id="copy">Kopier lenke</button>\n' +
    '  </div>\n' +
    '  <div class="social">' + social + '</div>\n' +
    '  ' + linksSection + '\n' +
    '  <div class="labels" id="plateselskaper">' + labels + '</div>\n' +
    '  <a class="back" href="' + esc(origin) + '/">← <span translate="no">Ambient Mann</span></a>\n' +
    '  <section class="logo-strip">' + logoStrip + '</section>\n' +
    '  ' + donation + '\n' +
    '</main>\n' +
    '<script>\n' +
    '(function(){\n' +
    '  var a=document.getElementById("a"),hint=document.getElementById("hint");\n' +
    '  var url=' + JSON.stringify(pageUrl) + ',title=' + JSON.stringify(rawTitle) + ';\n' +
    // Overlever avspillingen til forsiden: lagre hvilket spor + hvor langt vi
    // er kommet, så hovedspilleren kan fortsette der man slapp når man trykker
    // «← Ambient Mann» tilbake. Samme domene ⇒ delt localStorage.
    '  var tid=' + JSON.stringify(String(track.id)) + ',tslug=' + JSON.stringify(slug) + ';\n' +
    '  function saveResume(){try{localStorage.setItem("am_track_resume",JSON.stringify(\n' +
    '    {id:tid,slug:tslug,time:a.currentTime||0,playing:!a.paused,ts:Date.now()}));}catch(e){}}\n' +
    '  a.addEventListener("timeupdate",saveResume);a.addEventListener("pause",saveResume);\n' +
    // «← tilbake»-lenka OG Home-knappen i toppmenyen tar deg til forsiden i
    // SAMME fane og lar hovedspilleren fortsette dette sporet der du slapp:
    // vi lagrer posisjon + et «fortsett»-flagg rett før man navigerer bort.
    '  function goHome(){saveResume();try{localStorage.setItem("am_track_resume_go","1");}catch(e){}}\n' +
    '  var backLink=document.querySelector(".back");\n' +
    '  if(backLink)backLink.addEventListener("click",goHome);\n' +
    '  var homeBtn=document.querySelector(".topnav-home");\n' +
    '  if(homeBtn)homeBtn.addEventListener("click",goHome);\n' +
    // Autoplay: prøv med lyd først. Blokkerer nettleseren det (vanlig i en ny
    // fane uten brukertrykk), starter vi LIKEVEL med en gang – men dempet, som
    // alltid er tillatt – og slår på lyden ved første trykk/tast. Da spilles
    // sporet av umiddelbart, uten å måtte trykke play manuelt.
    '  var p=a.play();\n' +
    '  if(p&&p.catch){p.catch(function(){\n' +
    '    a.muted=true;\n' +
    '    a.play().catch(function(){});\n' +
    '    hint.textContent="🔊 Trykk hvor som helst for lyd";\n' +
    '    var unmute=function(){a.muted=false;if(a.paused){a.play().catch(function(){});}hint.textContent="";\n' +
    '      document.removeEventListener("pointerdown",unmute);document.removeEventListener("keydown",unmute);};\n' +
    '    document.addEventListener("pointerdown",unmute,{once:true});\n' +
    '    document.addEventListener("keydown",unmute,{once:true});\n' +
    '  });}\n' +
    '  a.addEventListener("playing",function(){if(!a.muted){hint.textContent="";}});\n' +
    '  document.getElementById("share").addEventListener("click",async function(){\n' +
    '    var data={title:"Ambient Mann — "+title,text:"Hør «"+title+"» hos Ambient Mann",url:url};\n' +
    '    if(navigator.share){try{await navigator.share(data);return;}catch(e){if(e&&e.name==="AbortError")return;}}\n' +
    '    copy();\n' +
    '  });\n' +
    '  function copy(){try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url);}\n' +
    '    else{var t=document.createElement("textarea");t.value=url;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();}\n' +
    '    hint.textContent="Lenke kopiert!";}catch(e){}}\n' +
    '  document.getElementById("copy").addEventListener("click",copy);\n' +
    // Om Ambient Mann – åpne/lukke overlay.
    '  var ab=document.getElementById("about-ov"),abBtn=document.querySelector(".topnav-about");\n' +
    '  if(ab&&abBtn){var abClose=function(){ab.classList.remove("open");};\n' +
    '    abBtn.addEventListener("click",function(e){e.preventDefault();ab.classList.add("open");});\n' +
    '    ab.querySelector(".x").addEventListener("click",abClose);\n' +
    '    ab.addEventListener("click",function(e){if(e.target===ab)abClose();});\n' +
    '    document.addEventListener("keydown",function(e){if(e.key==="Escape")abClose();});}\n' +
    // «Donasjon» i toppmenyen ruller til blokken nederst (samme side) – åpne den
    // sammenleggbare blokken så man ser skjemaet med en gang.
    '  var donNav=document.querySelector(\'.topnav a[href="#donasjon"]\'),\n' +
    '      donDet=document.querySelector("#donasjon .don-details");\n' +
    '  if(donNav&&donDet)donNav.addEventListener("click",function(){donDet.open=true;});\n' +
    // Donasjon – forhåndsvalg + kortbetaling (Stripe). Vipps er en ren lenke.
    '  var amt=document.getElementById("don-amount");\n' +
    '  if(amt){\n' +
    '    var clampKr=function(k){k=Math.round(k)||0;return Math.max(20,Math.min(10000,k));};\n' +
    '    var presets=[].slice.call(document.querySelectorAll(".don-preset"));\n' +
    '    var setAmt=function(k){k=clampKr(k);amt.value=k;presets.forEach(function(b){\n' +
    '      b.classList.toggle("active",parseInt(b.getAttribute("data-kr"),10)===k);});};\n' +
    '    presets.forEach(function(b){b.addEventListener("click",function(){\n' +
    '      setAmt(parseInt(b.getAttribute("data-kr"),10));});});\n' +
    '    amt.addEventListener("input",function(){presets.forEach(function(b){b.classList.remove("active");});});\n' +
    '    setAmt(100);\n' +
    '    var st=document.getElementById("don-stripe");\n' +
    '    if(st)st.addEventListener("click",async function(){\n' +
    '      var kr=clampKr(parseInt(amt.value,10)||100);st.disabled=true;\n' +
    '      try{var r=await fetch("/api/create-checkout",{method:"POST",\n' +
    '        headers:{"Content-Type":"application/json"},body:JSON.stringify({product:"donation",amountKr:kr})});\n' +
    '        if(r.status===503){alert("Kortbetaling er ikke satt opp ennå – bruk Vipps så lenge.");return;}\n' +
    '        var d=await r.json().catch(function(){return{};});\n' +
    '        if(r.ok&&d.url){window.location.href=d.url;return;}\n' +
    '        alert(d.error||"Kunne ikke starte betaling.");\n' +
    '      }catch(e){alert("Kortbetaling er ikke tilgjengelig her – bruk Vipps.");}\n' +
    '      finally{st.disabled=false;}\n' +
    '    });\n' +
    '  }\n' +
    '})();\n' +
    // Bevegelig stjernehimmel – samme effekt som forsiden (js/starfield.js).
    '(function(){\n' +
    '  var canvas=document.getElementById("starfield");if(!canvas)return;\n' +
    '  var ctx=canvas.getContext("2d");\n' +
    '  var w,h,dpr,stars=[],nebulae=[];var STAR_COUNT=220;\n' +
    '  var shooting=[],nextShoot=4;\n' +
    '  function rand(a,b){return a+Math.random()*(b-a);}\n' +
    '  function spawnShoot(){var down=Math.PI*rand(0.12,0.38);var dir=Math.random()<0.5?1:-1;var speed=rand(7,12)*dpr;\n' +
    '    shooting.push({x:dir>0?rand(0,w*0.5):rand(w*0.5,w),y:rand(0,h*0.4),\n' +
    '      vx:dir*Math.cos(down)*speed,vy:Math.sin(down)*speed,len:rand(140,280)*dpr,life:1});}\n' +
    '  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);\n' +
    '    w=canvas.width=Math.floor(innerWidth*dpr);h=canvas.height=Math.floor(innerHeight*dpr);\n' +
    '    canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";build();}\n' +
    '  function build(){stars=[];for(var i=0;i<STAR_COUNT;i++){stars.push({\n' +
    '    x:Math.random()*w,y:Math.random()*h,z:rand(0.2,1),tw:rand(0,Math.PI*2),tws:rand(0.6,2.2)});}\n' +
    '    nebulae=[{x:w*0.2,y:h*0.25,r:Math.max(w,h)*0.45,c:"80,120,255"},\n' +
    '      {x:w*0.8,y:h*0.7,r:Math.max(w,h)*0.5,c:"150,90,255"},\n' +
    '      {x:w*0.55,y:h*0.15,r:Math.max(w,h)*0.35,c:"90,220,255"}];}\n' +
    '  var t=0;\n' +
    '  function frame(){t+=0.016;ctx.clearRect(0,0,w,h);\n' +
    '    for(var i=0;i<nebulae.length;i++){var n=nebulae[i];\n' +
    '      var g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);\n' +
    '      g.addColorStop(0,"rgba("+n.c+",0.08)");g.addColorStop(1,"rgba(0,0,0,0)");\n' +
    '      ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}\n' +
    '    for(var j=0;j<stars.length;j++){var s=stars[j];\n' +
    '      s.y+=s.z*0.12*dpr;if(s.y>h){s.y=0;s.x=Math.random()*w;}\n' +
    '      var aa=0.35+0.65*(0.5+0.5*Math.sin(t*s.tws+s.tw));var r=s.z*1.6*dpr;\n' +
    '      ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);\n' +
    '      ctx.fillStyle="rgba(200,228,255,"+(aa*s.z)+")";ctx.fill();}\n' +
    '    nextShoot-=0.016;if(nextShoot<=0){spawnShoot();nextShoot=rand(7,18);}\n' +
    '    for(var k=shooting.length-1;k>=0;k--){var m=shooting[k];\n' +
    '      m.x+=m.vx;m.y+=m.vy;m.life-=0.012;var d=Math.hypot(m.vx,m.vy)||1;\n' +
    '      var tx=m.x-(m.vx/d)*m.len,ty=m.y-(m.vy/d)*m.len;var al=Math.max(0,Math.min(1,m.life));\n' +
    '      var gg=ctx.createLinearGradient(m.x,m.y,tx,ty);\n' +
    '      gg.addColorStop(0,"rgba(255,255,255,"+(0.9*al)+")");\n' +
    '      gg.addColorStop(0.4,"rgba(180,210,255,"+(0.35*al)+")");\n' +
    '      gg.addColorStop(1,"rgba(180,210,255,0)");\n' +
    '      ctx.strokeStyle=gg;ctx.lineWidth=2*dpr;ctx.lineCap="round";\n' +
    '      ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(tx,ty);ctx.stroke();\n' +
    '      ctx.beginPath();ctx.arc(m.x,m.y,1.6*dpr,0,Math.PI*2);\n' +
    '      ctx.fillStyle="rgba(255,255,255,"+al+")";ctx.fill();\n' +
    '      if(m.life<=0||m.x<-m.len||m.x>w+m.len||m.y>h+m.len)shooting.splice(k,1);}\n' +
    '    requestAnimationFrame(frame);}\n' +
    '  addEventListener("resize",resize);resize();frame();\n' +
    '})();\n' +
    '</script>\n' +
    // Språkvelger + Google Translate – samme oppsett/oppførsel som forsiden
    // (standard engelsk, valg lagret i cookie, merkenavn-vern «Ambient Mann»).
    '<script src="/js/lang.js"></script>\n' +
    '<script src="https://translate.google.com/translate_a/element.js?cb=amGoogleTranslateInit"></script>\n' +
    '</body>\n</html>';

  res.statusCode = 200;
  return res.end(html);
};
