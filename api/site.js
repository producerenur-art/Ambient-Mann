// api/site.js — samlet backend for Ambient Mann-siden (multiplekset ?action=).
//
//   GET  ?action=content-get     (offentlig)  → alt innhold (bio/plan/lenker/stream/spor)
//   GET  ?action=tracks-list     (offentlig)  → [ spor ]
//   GET  ?action=owner-status    (offentlig)  → { hasPassword, resetSupported }
//   POST ?action=login           {password}   → { token }   (12t HMAC)  — KUN Ambient Mann
//   POST ?action=set-password    {password}   (første gang / innlogget) → oppretter/endrer passord
//   POST ?action=forgot          {email}      → sender tilbakestillingslenke på e-post
//   POST ?action=reset           {token,password}  → setter nytt passord via lenke
//   POST ?action=content-set     {key,data}   (eier)
//   POST ?action=track-add       {..meta}     (eier)
//   POST ?action=track-delete    {path}       (eier)
//   POST ?action=upload-url      {path}       (eier)  → signert Supabase-URL
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
const ALLOWED_KEYS = new Set(['bio', 'credits', 'liveDescription', 'schedule', 'links', 'stream', 'tracks', 'liveBg']);
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

async function sendResetEmail(to, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM_EMAIL || 'Ambient Mann <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject: 'Tilbakestill passord — Ambient Mann',
        html: '<p>Du (eller noen) ba om å tilbakestille passordet til Ambient Mann-siden.</p>' +
              '<p><a href="' + link + '">Klikk her for å sette nytt passord</a></p>' +
              '<p>Lenken er gyldig i 1 time. Ignorer denne e-posten hvis det ikke var deg.</p>',
      }),
    });
    return r.ok;
  } catch (_) { return false; }
}

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

    // ---------- EIER-GATED (skriving) ----------
    if (['content-set', 'track-add', 'track-delete', 'upload-url'].indexOf(action) !== -1) {
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
