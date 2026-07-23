// api/site.js — samlet backend for Ambient Mann-siden (multiplekset ?action=).
//
//   GET  ?action=content-get     (offentlig)  → alt innhold (bio/plan/lenker/stream/spor)
//   GET  ?action=tracks-list     (offentlig)  → [ spor ]
//   POST ?action=play            {id,title}   (offentlig) → teller +1 avspilling
//   GET  ?action=plays           (eier)       → { plays:[{id,title,count}], total }
//   GET  ?action=owner-status    (offentlig)  → { hasPassword, resetSupported }
//   POST ?action=login           {password}   → { token }   (12t HMAC)  — KUN Ambient Mann
//   POST ?action=set-password    {password}   (første gang / innlogget) → oppretter/endrer passord
//   POST ?action=forgot          {email}      → sender tilbakestillingslenke på e-post
//   POST ?action=reset           {token,password}  → setter nytt passord via lenke
//   POST ?action=content-set     {key,data}   (eier)
//   POST ?action=track-add       {..meta}     (eier)
//   POST ?action=track-delete    {path}       (eier)
//   POST ?action=upload-url      {path}       (eier)  → signert Supabase-URL
//   --- GJEST (flere kontoer; guest_account) ---
//   GET  ?action=guest-status    (offentlig)  → { signupSupported, resetSupported }
//   POST ?action=guest-signup    {email,name,password} → oppretter konto + bekreftelses-e-post
//   POST ?action=guest-confirm   {token}      → bekrefter e-post
//   POST ?action=guest-login     {email,password} → { token } (7d) hvis bekreftet
//   POST ?action=guest-forgot    {email}      / guest-reset {token,password}
//   POST ?action=guest-schedule-add/-delete   (gjest, godkjent) → egen sendetid
//   POST ?action=guest-upload-url/-track-add/-track-delete (gjest) → egne spor
//   POST ?action=guest-stream-set {url,nowPlayingUrl} (gjest) → egen live-stream
//   GET  ?action=guest-list  / POST guest-approve {id,approved} / guest-delete {id}  (eier)
//
// Passord (scrypt-hash) + reset-token ligger i tabellen owner_account (RLS lukket,
// aldri offentlig lesbar). Innhold ligger i site_content(key,data). Trygg som
// standard: uten Supabase-env faller innlogging tilbake til OWNER_PASSCODE (bootstrap),
// lesing svarer tomt, og skriving gir 503.
'use strict';

const crypto = require('crypto');
const hmac = require('./_hmac');
let createClient = null;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) {}

const BUCKET = process.env.SUPABASE_BUCKET || 'ambient-mann-media';
const ALLOWED_KEYS = new Set(['bio', 'credits', 'liveDescription', 'schedule', 'links', 'labels', 'stream', 'tracks', 'liveBg', 'sectionOrder']);
const BANNED = /kali\s*earth/ig;

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !createClient) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  return req.body;
}
function scrub(v) {
  if (typeof v === 'string') return v.replace(BANNED, '').replace(/\s{2,}/g, ' ').trim();
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = scrub(v[k]); return o; }
  return v;
}
function ownerClaim(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { const c = hmac.verify(m[1]); return (c && c.purpose === 'owner') ? c : null; } catch (_) { return null; }
}

// ---- passord-hjelpere (scrypt) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + '$' + h;
}
function verifyPassword(pw, stored) {
  if (!stored || String(stored).indexOf('$') < 0) return false;
  const parts = String(stored).split('$');
  const cand = crypto.scryptSync(String(pw), parts[0], 64).toString('hex');
  const a = Buffer.from(cand), b = Buffer.from(parts[1]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// ---- owner_account tabell ----
async function getOwner(c) {
  try { const { data } = await c.from('owner_account').select('*').eq('id', 1).maybeSingle(); return data || null; }
  catch (_) { return null; }
}
function setOwner(c, patch) {
  return c.from('owner_account').upsert(Object.assign({ id: 1, updated_at: new Date().toISOString() }, patch));
}
function ownerEmail(owner) { return (owner && owner.email) || process.env.OWNER_EMAIL || ''; }

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM_EMAIL || 'Ambient Mann <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return r.ok;
  } catch (_) { return false; }
}

function sendResetEmail(to, link) {
  return sendEmail(to, 'Tilbakestill passord — Ambient Mann',
    '<p>Du (eller noen) ba om å tilbakestille passordet til Ambient Mann-siden.</p>' +
    '<p><a href="' + link + '">Klikk her for å sette nytt passord</a></p>' +
    '<p>Lenken er gyldig i 1 time. Ignorer denne e-posten hvis det ikke var deg.</p>');
}

// ---- gjeste-kontoer (guest_account) ----
function guestClaim(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { const c = hmac.verify(m[1]); return (c && c.purpose === 'guest' && c.gid) ? c : null; } catch (_) { return null; }
}
async function getGuestByEmail(c, email) {
  try { const { data } = await c.from('guest_account').select('*').eq('email', String(email).toLowerCase()).maybeSingle(); return data || null; }
  catch (_) { return null; }
}
async function getGuestById(c, id) {
  try { const { data } = await c.from('guest_account').select('*').eq('id', id).maybeSingle(); return data || null; }
  catch (_) { return null; }
}
function issueGuestToken(res, guest) {
  try {
    const token = hmac.sign({ purpose: 'guest', gid: guest.id, name: guest.name || '' }, 7 * 24 * 3600);
    return res.status(200).json({ token, gid: guest.id, name: guest.name || '', approved: !!guest.approved });
  } catch (e) { return res.status(503).json({ error: 'Token-hemmelighet mangler (AM_TOKEN_SECRET).' }); }
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

// ---- innhold ----
async function readKey(c, key) {
  const { data, error } = await c.from('site_content').select('data').eq('key', key).maybeSingle();
  if (error) return null;
  return data ? data.data : null;
}
function writeKey(c, key, data) {
  return c.from('site_content').upsert({ key, data, updated_at: new Date().toISOString() });
}

function issueToken(res) {
  try { return res.status(200).json({ token: hmac.sign({ purpose: 'owner' }, 12 * 3600) }); }
  catch (e) { return res.status(503).json({ error: 'Token-hemmelighet mangler (AM_TOKEN_SECRET).' }); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = String((req.query && req.query.action) || '');
  const body = readBody(req);
  const c = sb();

  try {
    // ---------- OFFENTLIG LESING ----------
    if (action === 'content-get') {
      if (!c) return res.status(200).json({});
      const { data, error } = await c.from('site_content').select('key,data');
      if (error) return res.status(200).json({});
      const out = {}; (data || []).forEach(r => { out[r.key] = r.data; });
      return res.status(200).json(out);
    }
    if (action === 'tracks-list') {
      if (!c) return res.status(200).json([]);
      const arr = await readKey(c, 'tracks');
      return res.status(200).json(Array.isArray(arr) ? arr : []);
    }
    // Teller +1 avspilling for et spor. Offentlig (alle lyttere), fyr-og-glem.
    // Uten Supabase svarer vi bare ok (ingen lagring). Feil svelges stille.
    if (action === 'play') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const id = String(body.id || '').slice(0, 120);
      if (!id) return res.status(400).json({ error: 'Mangler spor-id' });
      const title = scrub(String(body.title || '')).slice(0, 200);
      if (c) { try { await c.rpc('increment_play', { p_id: id, p_title: title }); } catch (_) {} }
      return res.status(200).json({ ok: true });
    }
    // Avspillingstall — KUN eier. Sortert høyest først, med totalsum.
    if (action === 'plays') {
      if (!ownerClaim(req)) return res.status(401).json({ error: 'Logg inn som eier.' });
      if (!c) return res.status(200).json({ plays: [], total: 0 });
      const { data } = await c.from('track_plays')
        .select('track_id,title,count').order('count', { ascending: false });
      const plays = (data || []).map(r => ({ id: r.track_id, title: r.title || '', count: Number(r.count) || 0 }));
      const total = plays.reduce((a, b) => a + b.count, 0);
      return res.status(200).json({ plays, total });
    }
    if (action === 'owner-status') {
      let hasPassword = false;
      if (c) { const o = await getOwner(c); hasPassword = !!(o && o.pass_hash); }
      if (!hasPassword && process.env.OWNER_PASSCODE) hasPassword = true;   // bootstrap-kode teller
      const resetSupported = !!(c && process.env.RESEND_API_KEY);
      const canCreate = !!c && !hasPassword;   // kan opprette passord kun med Supabase + intet satt
      return res.status(200).json({ hasPassword, resetSupported, canCreate });
    }

    // ---------- INNLOGGING (kun Ambient Mann) ----------
    if (action === 'login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const pw = String(body.password || '');
      if (c) {
        const o = await getOwner(c);
        if (o && o.pass_hash) {
          if (!verifyPassword(pw, o.pass_hash)) return res.status(401).json({ error: 'Feil passord.' });
          return issueToken(res);
        }
      }
      // Bootstrap-fallback: OWNER_PASSCODE i env (til passord er opprettet i DB)
      const real = process.env.OWNER_PASSCODE;
      if (!real) return res.status(503).json({ error: 'Innlogging ikke satt opp ennå.' });
      const a = Buffer.from(pw), b = Buffer.from(String(real));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Feil passord.' });
      return issueToken(res);
    }

    // Opprett passord (første gang) eller endre (innlogget)
    if (action === 'set-password') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Passord krever Supabase (se README).' });
      const pw = String(body.password || '');
      if (pw.length < 6) return res.status(400).json({ error: 'Passordet må være minst 6 tegn.' });
      const o = await getOwner(c);
      const firstTime = !(o && o.pass_hash);
      if (!firstTime && !ownerClaim(req)) return res.status(401).json({ error: 'Logg inn for å endre passord.' });
      const patch = { pass_hash: hashPassword(pw), reset_token: null, reset_exp: null };
      const email = String(body.email || '').trim();
      if (firstTime) patch.email = email || process.env.OWNER_EMAIL || '';
      const { error } = await setOwner(c, patch);
      if (error) return res.status(500).json({ error: error.message });
      return issueToken(res);   // logg inn med det samme
    }

    // Glemt passord → send tilbakestillingslenke (kun til Ambient Manns e-post)
    if (action === 'forgot') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      // Alltid generisk svar (ikke lekk om e-posten finnes).
      const generic = () => res.status(200).json({ ok: true });
      if (!c) return generic();
      const o = await getOwner(c);
      const allowed = ownerEmail(o);
      const email = String(body.email || '').trim();
      if (!allowed || email.toLowerCase() !== allowed.toLowerCase()) return generic();
      const token = crypto.randomBytes(24).toString('hex');
      await setOwner(c, { email: allowed, reset_token: sha256(token), reset_exp: Date.now() + 3600e3 });
      const siteUrl = process.env.SITE_URL || ('https://' + req.headers.host);
      await sendResetEmail(allowed, siteUrl + '/?reset=' + token);
      return generic();
    }

    // Sett nytt passord via reset-lenke
    if (action === 'reset') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const pw = String(body.password || ''), token = String(body.token || '');
      if (pw.length < 6) return res.status(400).json({ error: 'Passordet må være minst 6 tegn.' });
      const o = await getOwner(c);
      if (!o || !o.reset_token || !o.reset_exp || o.reset_exp < Date.now())
        return res.status(400).json({ error: 'Lenken er ugyldig eller utløpt.' });
      if (sha256(token) !== o.reset_token) return res.status(400).json({ error: 'Lenken er ugyldig.' });
      const { error } = await setOwner(c, { pass_hash: hashPassword(pw), reset_token: null, reset_exp: null });
      if (error) return res.status(500).json({ error: error.message });
      return issueToken(res);
    }

    // ---------- GJEST: registrering / innlogging / sendetid ----------
    if (action === 'guest-status') {
      const signupSupported = !!c;
      const resetSupported = !!(c && process.env.RESEND_API_KEY);
      const confirmSupported = resetSupported;   // e-postbekreftelse krever Resend
      return res.status(200).json({ signupSupported, resetSupported, confirmSupported });
    }

    if (action === 'guest-signup') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Registrering krever Supabase (se README).' });
      const email = String(body.email || '').trim().toLowerCase();
      const name = scrub(String(body.name || '')).slice(0, 80);
      const pw = String(body.password || '');
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Ugyldig e-post.' });
      if (!name) return res.status(400).json({ error: 'Skriv navnet/artistnavnet ditt.' });
      if (pw.length < 6) return res.status(400).json({ error: 'Passordet må være minst 6 tegn.' });
      const existing = await getGuestByEmail(c, email);
      if (existing && existing.confirmed) return res.status(409).json({ error: 'E-posten er allerede registrert. Prøv å logge inn.' });
      const confirmSupported = !!process.env.RESEND_API_KEY;
      const rawToken = crypto.randomBytes(24).toString('hex');
      const row = {
        email, name, pass_hash: hashPassword(pw),
        confirmed: !confirmSupported,   // uten e-post-motor: regnes som bekreftet med det samme
        confirm_token: confirmSupported ? sha256(rawToken) : null,
        approved: false, reset_token: null, reset_exp: null,
        updated_at: new Date().toISOString(),
      };
      // oppdater hvis en ubekreftet rad allerede finnes, ellers sett inn ny
      let dberr;
      if (existing) ({ error: dberr } = await c.from('guest_account').update(row).eq('id', existing.id));
      else ({ error: dberr } = await c.from('guest_account').insert(row));
      if (dberr) return res.status(500).json({ error: dberr.message });
      if (confirmSupported) {
        const siteUrl = process.env.SITE_URL || ('https://' + req.headers.host);
        await sendEmail(email, 'Bekreft e-post — Gjest hos Ambient Mann',
          '<p>Hei ' + (name || '') + '!</p>' +
          '<p>Du har registrert deg som gjest for å hoste live stream på Ambient Mann-siden.</p>' +
          '<p><a href="' + siteUrl + '/?gconfirm=' + rawToken + '">Klikk her for å bekrefte e-posten din</a></p>' +
          '<p>Etter bekreftelse kan du logge inn. Ambient Mann godkjenner deretter kontoen din før du kan sette sendetid.</p>' +
          '<p>Ignorer denne e-posten hvis det ikke var deg.</p>');
      }
      return res.status(200).json({ ok: true, needsConfirm: confirmSupported });
    }

    if (action === 'guest-confirm') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const token = String(body.token || '');
      if (!token) return res.status(400).json({ error: 'Mangler bekreftelses-token.' });
      const { data: g } = await c.from('guest_account').select('*').eq('confirm_token', sha256(token)).maybeSingle();
      if (!g) return res.status(400).json({ error: 'Lenken er ugyldig eller allerede brukt.' });
      const { error } = await c.from('guest_account').update({ confirmed: true, confirm_token: null, updated_at: new Date().toISOString() }).eq('id', g.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'guest-login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Innlogging krever Supabase (se README).' });
      const email = String(body.email || '').trim().toLowerCase();
      const pw = String(body.password || '');
      const g = await getGuestByEmail(c, email);
      if (!g || !verifyPassword(pw, g.pass_hash)) return res.status(401).json({ error: 'Feil e-post eller passord.' });
      if (!g.confirmed) return res.status(403).json({ error: 'Bekreft e-posten din først (sjekk innboksen).' });
      return issueGuestToken(res, g);
    }

    if (action === 'guest-forgot') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const generic = () => res.status(200).json({ ok: true });
      if (!c) return generic();
      const email = String(body.email || '').trim().toLowerCase();
      const g = await getGuestByEmail(c, email);
      if (!g) return generic();   // ikke lekk om e-posten finnes
      const rawToken = crypto.randomBytes(24).toString('hex');
      await c.from('guest_account').update({ reset_token: sha256(rawToken), reset_exp: Date.now() + 3600e3, updated_at: new Date().toISOString() }).eq('id', g.id);
      const siteUrl = process.env.SITE_URL || ('https://' + req.headers.host);
      await sendResetEmail(email, siteUrl + '/?greset=' + rawToken);
      return generic();
    }

    if (action === 'guest-reset') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const pw = String(body.password || ''), token = String(body.token || '');
      if (pw.length < 6) return res.status(400).json({ error: 'Passordet må være minst 6 tegn.' });
      const { data: g } = await c.from('guest_account').select('*').eq('reset_token', sha256(token)).maybeSingle();
      if (!g || !g.reset_exp || g.reset_exp < Date.now()) return res.status(400).json({ error: 'Lenken er ugyldig eller utløpt.' });
      const { error } = await c.from('guest_account').update({ pass_hash: hashPassword(pw), reset_token: null, reset_exp: null, confirmed: true, updated_at: new Date().toISOString() }).eq('id', g.id);
      if (error) return res.status(500).json({ error: error.message });
      return issueGuestToken(res, g);
    }

    // Gjest legger til / fjerner sin egen sendetid (må være godkjent av eier)
    if (action === 'guest-schedule-add') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req);
      if (!claim) return res.status(401).json({ error: 'Logg inn som gjest.' });
      if (!c) return res.status(503).json({ error: 'Lagring ikke satt opp (mangler Supabase-env).' });
      const g = await getGuestById(c, claim.gid);
      if (!g) return res.status(401).json({ error: 'Fant ikke kontoen din.' });
      if (!g.approved) return res.status(403).json({ error: 'Kontoen din venter på godkjenning fra Ambient Mann.' });
      const start = String(body.start || '');
      if (!start || isNaN(new Date(start).getTime())) return res.status(400).json({ error: 'Ugyldig dato/tid.' });
      const link = String(body.link || '').trim();
      if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'Lenken må starte med http(s)://' });
      let arr = await readKey(c, 'guestSchedule'); if (!Array.isArray(arr)) arr = [];
      const entry = {
        id: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        gid: g.id, guestName: scrub(g.name || 'Gjest').slice(0, 80),
        start, hours: Math.max(1, Math.min(12, parseInt(body.hours, 10) || 2)),
        title: scrub(String(body.title || 'Live-sett')).slice(0, 200),
        link: link.slice(0, 500),
      };
      arr.push(entry);
      const { error } = await writeKey(c, 'guestSchedule', arr);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, entry });
    }

    if (action === 'guest-schedule-delete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req);
      const owner = ownerClaim(req);
      if (!claim && !owner) return res.status(401).json({ error: 'Ikke innlogget.' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const id = String(body.id || '');
      let arr = await readKey(c, 'guestSchedule'); if (!Array.isArray(arr)) arr = [];
      // gjest kan kun slette egne; eier kan slette alle
      arr = arr.filter(e => e.id !== id || (!owner && e.gid !== claim.gid));
      const { error } = await writeKey(c, 'guestSchedule', arr);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Gjest: signert opplastings-URL (kun godkjent gjest, egen mappe)
    if (action === 'guest-upload-url') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req);
      if (!claim) return res.status(401).json({ error: 'Logg inn som gjest.' });
      if (!c) return res.status(503).json({ error: 'Lagring ikke satt opp (mangler Supabase-env).' });
      const g = await getGuestById(c, claim.gid);
      if (!g || !g.approved) return res.status(403).json({ error: 'Kontoen din venter på godkjenning.' });
      let path = typeof body.path === 'string' ? body.path.trim() : '';
      if (!path || path.includes('..') || path.startsWith('/') || path.length > 256)
        return res.status(400).json({ error: 'Ugyldig filsti' });
      // tving alle gjeste-opplastinger inn i egen mappe: guest/<gid>/…
      path = 'guest/' + claim.gid + '/' + path.replace(/^guest\/\d+\//, '');
      const { data, error } = await c.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return res.status(500).json({ error: error.message });
      const publicUrl = c.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
      return res.status(200).json({ token: data.token, path: data.path, publicUrl, bucket: BUCKET });
    }

    // Gjest: legg til opplastet spor (i egen offentlig liste 'guestTracks')
    if (action === 'guest-track-add') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req);
      if (!claim) return res.status(401).json({ error: 'Logg inn som gjest.' });
      if (!c) return res.status(503).json({ error: 'Lagring ikke satt opp.' });
      const g = await getGuestById(c, claim.gid);
      if (!g || !g.approved) return res.status(403).json({ error: 'Kontoen din venter på godkjenning.' });
      let arr = await readKey(c, 'guestTracks'); if (!Array.isArray(arr)) arr = [];
      const meta = {
        id: String(body.id || ('gt_' + Date.now())),
        gid: g.id, guestName: scrub(g.name || 'Gjest').slice(0, 80),
        title: scrub(String(body.title || 'Spor')).slice(0, 200),
        url: String(body.url || ''), path: String(body.path || ''), size: Number(body.size) || 0,
        coverUrl: /^https?:\/\//i.test(String(body.coverUrl || '')) ? String(body.coverUrl) : '',
        coverPath: String(body.coverPath || ''),
      };
      if (!/^https?:\/\//i.test(meta.url)) return res.status(400).json({ error: 'Ugyldig URL' });
      // gjesten kan kun legge til spor med filer i sin egen mappe
      if (meta.path && meta.path.indexOf('guest/' + g.id + '/') !== 0) return res.status(400).json({ error: 'Ugyldig filsti' });
      arr.push(meta);
      const { error } = await writeKey(c, 'guestTracks', arr);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, track: meta });
    }

    // Gjest (eget) / eier (alle): slett gjeste-spor + fil
    if (action === 'guest-track-delete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req), owner = ownerClaim(req);
      if (!claim && !owner) return res.status(401).json({ error: 'Ikke innlogget.' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const id = String(body.id || '');
      let arr = await readKey(c, 'guestTracks'); if (!Array.isArray(arr)) arr = [];
      const t = arr.find(x => x.id === id);
      if (!t) return res.status(200).json({ ok: true });
      if (!owner && t.gid !== claim.gid) return res.status(403).json({ error: 'Ikke ditt spor.' });
      arr = arr.filter(x => x.id !== id);
      await writeKey(c, 'guestTracks', arr);
      const rm = [t.path, t.coverPath].filter(Boolean);
      if (rm.length) { try { await c.storage.from(BUCKET).remove(rm); } catch (_) {} }
      return res.status(200).json({ ok: true });
    }

    // Gjest: sett/oppdater egen live-stream (URL + now-playing) i 'guestStreams'
    if (action === 'guest-stream-set') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const claim = guestClaim(req);
      if (!claim) return res.status(401).json({ error: 'Logg inn som gjest.' });
      if (!c) return res.status(503).json({ error: 'Lagring ikke satt opp.' });
      const g = await getGuestById(c, claim.gid);
      if (!g || !g.approved) return res.status(403).json({ error: 'Kontoen din venter på godkjenning.' });
      const url = String(body.url || '').trim();
      const np = String(body.nowPlayingUrl || '').trim();
      if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Stream-URL må starte med http(s)://' });
      if (np && !/^https?:\/\//i.test(np)) return res.status(400).json({ error: 'Now-playing-URL må starte med http(s)://' });
      let obj = await readKey(c, 'guestStreams'); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
      if (!url && !np) delete obj[g.id];
      else obj[g.id] = { gid: g.id, guestName: scrub(g.name || 'Gjest').slice(0, 80), url, nowPlayingUrl: np };
      const { error } = await writeKey(c, 'guestStreams', obj);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Eier: liste gjester (for godkjenning) + godkjenn/avvis
    if (action === 'guest-list') {
      if (!ownerClaim(req)) return res.status(401).json({ error: 'Logg inn som eier.' });
      if (!c) return res.status(200).json({ guests: [] });
      const { data } = await c.from('guest_account')
        .select('id,email,name,confirmed,approved,created_at').order('created_at', { ascending: false });
      return res.status(200).json({ guests: data || [] });
    }
    if (action === 'guest-approve') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!ownerClaim(req)) return res.status(401).json({ error: 'Logg inn som eier.' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const id = body.id;
      const approved = !!body.approved;
      const g = await getGuestById(c, id);
      if (!g) return res.status(404).json({ error: 'Fant ikke gjesten.' });
      const { error } = await c.from('guest_account').update({ approved, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      // varsle gjesten på e-post når de blir godkjent
      if (approved && !g.approved && g.email) {
        const siteUrl = process.env.SITE_URL || ('https://' + req.headers.host);
        await sendEmail(g.email, 'Du er godkjent — Gjest hos Ambient Mann',
          '<p>Hei ' + (g.name || '') + '!</p>' +
          '<p>Ambient Mann har godkjent gjeste-kontoen din. Du kan nå logge inn og sette opp din egen live stream-tid.</p>' +
          '<p><a href="' + siteUrl + '/#gjest-live">Åpne Gjest Show Live Stream</a></p>');
      }
      return res.status(200).json({ ok: true });
    }
    if (action === 'guest-delete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!ownerClaim(req)) return res.status(401).json({ error: 'Logg inn som eier.' });
      if (!c) return res.status(503).json({ error: 'Ikke satt opp.' });
      const id = body.id;
      await c.from('guest_account').delete().eq('id', id);
      // fjern gjestens sendetider også
      let arr = await readKey(c, 'guestSchedule'); if (!Array.isArray(arr)) arr = [];
      arr = arr.filter(e => e.gid !== id);
      await writeKey(c, 'guestSchedule', arr);
      return res.status(200).json({ ok: true });
    }

    // ---------- EIER-GATED (skriving) ----------
    if (['content-set', 'track-add', 'track-delete', 'track-file-remove', 'upload-url'].indexOf(action) !== -1) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!ownerClaim(req)) return res.status(401).json({ error: 'Logg inn som eier.' });
      if (!c) return res.status(503).json({ error: 'Lagring ikke satt opp (mangler Supabase-env).' });

      if (action === 'content-set') {
        const key = String(body.key || '');
        if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: 'Ukjent nøkkel' });
        const data = scrub(body.data);
        if (JSON.stringify(data || '').length > 200000) return res.status(413).json({ error: 'For stort innhold' });
        const { error } = await writeKey(c, key, data);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }
      if (action === 'track-add') {
        let arr = await readKey(c, 'tracks'); if (!Array.isArray(arr)) arr = [];
        const meta = {
          id: String(body.id || ('t_' + Date.now())),
          title: scrub(String(body.title || 'Spor')).slice(0, 200),
          url: String(body.url || ''), path: String(body.path || ''), size: Number(body.size) || 0,
          coverUrl: /^https?:\/\//i.test(String(body.coverUrl || '')) ? String(body.coverUrl) : '',
          coverPath: String(body.coverPath || ''),
        };
        if (!/^https?:\/\//i.test(meta.url)) return res.status(400).json({ error: 'Ugyldig URL' });
        arr.push(meta);
        const { error } = await writeKey(c, 'tracks', arr);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, track: meta });
      }
      if (action === 'track-delete') {
        const path = String(body.path || '');
        const coverPath = String(body.coverPath || '');
        let arr = await readKey(c, 'tracks'); if (!Array.isArray(arr)) arr = [];
        arr = arr.filter(t => t.path !== path);
        await writeKey(c, 'tracks', arr);
        const rm = [path, coverPath].filter(Boolean);
        if (rm.length) { try { await c.storage.from(BUCKET).remove(rm); } catch (_) {} }
        return res.status(200).json({ ok: true });
      }
      if (action === 'track-file-remove') {
        // Sletter enkelt-filer fra storage (brukes når eier BYTTER cover/lyd på et
        // spor, så gamle – ofte svært store – filer ikke blir liggende igjen).
        const paths = Array.isArray(body.paths) ? body.paths.map(p => String(p || '')).filter(Boolean) : [];
        if (paths.length) { try { await c.storage.from(BUCKET).remove(paths); } catch (_) {} }
        return res.status(200).json({ ok: true });
      }
      if (action === 'upload-url') {
        const path = typeof body.path === 'string' ? body.path.trim() : '';
        if (!path || path.includes('..') || path.startsWith('/') || path.length > 256)
          return res.status(400).json({ error: 'Ugyldig filsti' });
        const { data, error } = await c.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) return res.status(500).json({ error: error.message });
        const publicUrl = c.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
        return res.status(200).json({ token: data.token, path: data.path, publicUrl, bucket: BUCKET });
      }
    }

    return res.status(400).json({ error: 'Ukjent action' });
  } catch (e) {
    console.error('site.js error:', e && e.message);
    return res.status(500).json({ error: 'Serverfeil' });
  }
};
