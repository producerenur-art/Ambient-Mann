// api/cover.js — statisk JPEG-versjon av eit cover-bilde (første ramme, maks 1200 px) til og:image.
// Facebook avviser og:image over ~8 MB og viser ikkje animerte GIF-ar; cover kan vere ein 9 MB GIF.
// Berre bilete frå vårt eige Supabase-lager blir henta (hindrar misbruk som open bilde-proxy).
const sharp = require('sharp');

const ALLOWED_HOST = /^eprcauxqmdlxjscygsrb\.supabase\.co$/i;

module.exports = async (req, res) => {
  try {
    const raw = String((req.query && req.query.u) || '');
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname) || !u.pathname.startsWith('/storage/v1/object/public/')) {
      res.statusCode = 400; return res.end('bad url');
    }
    const r = await fetch(u.href);
    if (!r.ok) { res.statusCode = 404; return res.end('not found'); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 40 * 1024 * 1024) { res.statusCode = 413; return res.end('too large'); }
    // 1200x630 (Facebook/X-bredformat): hele coveret (kvadrat) midt i bildet, utvida med uskarp
    // og mørkna versjon av seg sjølv på sidene — så ingenting blir beskore.
    const W = 1200, H = 630;
    const bg = await sharp(buf, { pages: 1 }).resize(W, H, { fit: 'cover' }).blur(40).modulate({ brightness: 0.55 }).jpeg({ quality: 80 }).toBuffer();
    const fg = await sharp(buf, { pages: 1 }).resize(H, H, { fit: 'inside', withoutEnlargement: false }).flatten({ background: '#0a0f2a' }).png().toBuffer();
    const out = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).jpeg({ quality: 84 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.statusCode = 200;
    return res.end(out);
  } catch (e) {
    res.statusCode = 500; return res.end('error');
  }
};
