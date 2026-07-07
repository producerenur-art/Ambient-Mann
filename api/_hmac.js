// Delt HMAC-token-helper for eier-autentisering (Ambient Mann).
// Signerer kortlevde tokens verifisert server-side med AM_TOKEN_SECRET.
// Ingen DB/sesjon nødvendig. Underscore-prefiks => Vercel behandler fila som
// delt kode, ikke et endepunkt.
const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function secret() {
  const s = process.env.AM_TOKEN_SECRET;
  if (!s) throw new Error('AM_TOKEN_SECRET er ikke satt på serveren');
  return s;
}
function hmac(data) {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

function sign(payload, ttlSeconds) {
  const body = Object.assign({}, payload, {
    exp: Math.floor(Date.now() / 1000) + (ttlSeconds || 3600),
  });
  const data = b64url(JSON.stringify(body));
  return data + '.' + hmac(data);
}

function verify(token) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const data = parts[0], mac = parts[1];
  const expected = hmac(data);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(b64urlDecode(data).toString('utf8')); } catch (e) { return null; }
  if (!body || typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

module.exports = { sign, verify };
