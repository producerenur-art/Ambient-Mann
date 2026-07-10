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

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.ambientmann.com';
  const origin = proto + '://' + host;

  let track = null;
  try {
    const c = sb();
    if (c) {
      const { data } = await c.from('site_content').select('data').eq('key', 'tracks').maybeSingle();
      const arr = data && Array.isArray(data.data) ? data.data : [];
      const want = slugify(id);
      // Nye lenker: pen tittel-slug (/track/all-the-way-from-heaven-017).
      // Gamle lenker: rå id (/track/t_xxxx) fungerer fortsatt.
      track = arr.find(t => t && String(t.id) === id)
           || arr.find(t => t && slugify(t.title) === want && want)
           || null;
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
  const pageUrl = origin + '/track/' + slug;
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

  const html = '<!doctype html>\n<html lang="no">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + title + ' · Ambient Mann</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<link rel="canonical" href="' + esc(pageUrl) + '">\n' +
    meta + '\n' +
    '<style>\n' +
    ':root{--bg:#04060f;--panel:rgba(16,20,38,.72);--line:rgba(140,160,255,.18);--text:#eaf0ff;--muted:#9aa6cf;--accent:#8ab4ff;--accent2:#7fe3b0}\n' +
    '*{box-sizing:border-box}\n' +
    'body{margin:0;min-height:100vh;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--text);\n' +
    '  background:radial-gradient(1200px 800px at 50% -10%,rgba(138,180,255,.14),transparent),var(--bg);\n' +
    '  display:flex;align-items:center;justify-content:center;padding:24px}\n' +
    // Samme bevegelige stjernehimmel som på forsiden (bak innholdet).
    '#starfield{position:fixed;inset:0;z-index:-2;pointer-events:none}\n' +
    'body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;\n' +
    '  background:radial-gradient(120% 80% at 50% 0%,rgba(0,0,0,0) 40%,rgba(2,4,12,.72) 100%)}\n' +
    '.card{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;text-align:center;\n' +
    '  backdrop-filter:blur(8px);box-shadow:0 20px 60px rgba(0,0,0,.45)}\n' +
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
    '</style>\n</head>\n<body>\n' +
    '<canvas id="starfield"></canvas>\n' +
    '<main class="card">\n' +
    '  <div class="cover" style="' + coverStyle + '">' + (cover ? '' : '♪') + '</div>\n' +
    '  <p class="brand" translate="no">Ambient Mann</p>\n' +
    '  <h1>' + title + '</h1>\n' +
    '  <audio id="a" controls autoplay playsinline preload="auto" src="' + esc(audioUrl) + '"></audio>\n' +
    '  <p class="hint" id="hint"></p>\n' +
    '  <div class="row">\n' +
    '    <button class="btn btn-primary" id="share">Del</button>\n' +
    '    <button class="btn" id="copy">Kopier lenke</button>\n' +
    '  </div>\n' +
    '  <div class="social">' + social + '</div>\n' +
    '  <a class="back" href="' + esc(origin) + '/">← <span translate="no">Ambient Mann</span></a>\n' +
    '</main>\n' +
    '<script>\n' +
    '(function(){\n' +
    '  var a=document.getElementById("a"),hint=document.getElementById("hint");\n' +
    '  var url=' + JSON.stringify(pageUrl) + ',title=' + JSON.stringify(rawTitle) + ';\n' +
    '  function tryPlay(){return a.play();}\n' +
    '  var p=tryPlay();\n' +
    '  if(p&&p.catch){p.catch(function(){\n' +
    '    hint.textContent="Trykk hvor som helst for å spille";\n' +
    '    var kick=function(){a.play().then(function(){hint.textContent="";}).catch(function(){});\n' +
    '      document.removeEventListener("pointerdown",kick);document.removeEventListener("keydown",kick);};\n' +
    '    document.addEventListener("pointerdown",kick,{once:true});\n' +
    '    document.addEventListener("keydown",kick,{once:true});\n' +
    '  });}\n' +
    '  a.addEventListener("playing",function(){hint.textContent="";});\n' +
    '  document.getElementById("share").addEventListener("click",async function(){\n' +
    '    var data={title:"Ambient Mann — "+title,text:"Hør «"+title+"» hos Ambient Mann",url:url};\n' +
    '    if(navigator.share){try{await navigator.share(data);return;}catch(e){if(e&&e.name==="AbortError")return;}}\n' +
    '    copy();\n' +
    '  });\n' +
    '  function copy(){try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url);}\n' +
    '    else{var t=document.createElement("textarea");t.value=url;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();}\n' +
    '    hint.textContent="Lenke kopiert!";}catch(e){}}\n' +
    '  document.getElementById("copy").addEventListener("click",copy);\n' +
    '})();\n' +
    // Bevegelig stjernehimmel – samme effekt som forsiden (js/starfield.js).
    '(function(){\n' +
    '  var canvas=document.getElementById("starfield");if(!canvas)return;\n' +
    '  var ctx=canvas.getContext("2d");\n' +
    '  var w,h,dpr,stars=[],nebulae=[];var STAR_COUNT=220;\n' +
    '  function rand(a,b){return a+Math.random()*(b-a);}\n' +
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
    '    requestAnimationFrame(frame);}\n' +
    '  addEventListener("resize",resize);resize();frame();\n' +
    '})();\n' +
    '</script>\n</body>\n</html>';

  res.statusCode = 200;
  return res.end(html);
};
