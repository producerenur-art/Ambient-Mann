/* =========================================================================
 * AMBIENT MANN — SC_Storage: laster opp store lydfiler (WAV/MP3, 1–2 t) rett
 * til Supabase Storage, forbi Vercels ~4.5 MB-grense. Nettleseren ser aldri
 * service_role-nøkkelen: den ber api/site?action=upload-url om en kortlevd
 * signert URL (kun for eier), og laster så opp bytene direkte.
 *
 * Trygg som standard: er Supabase ikke satt opp (tomme verdier i config),
 * returnerer isConfigured() false og opplasting kastes med 'not-configured'.
 * ========================================================================= */
window.SC_Storage = (function () {
  let _client = null;

  function _cfg() {
    const C = window.AM_CONFIG || {};
    return { url: C.SUPABASE_URL || '', anon: C.SUPABASE_ANON_KEY || '', bucket: C.SUPABASE_BUCKET || 'ambient-mann-media' };
  }

  function isConfigured() {
    const c = _cfg();
    return !!(c.url && c.anon && window.supabase && typeof window.supabase.createClient === 'function');
  }

  function client() {
    if (_client) return _client;
    const c = _cfg();
    _client = window.supabase.createClient(c.url, c.anon, { auth: { persistSession: false } });
    return _client;
  }

  function _ext(file) {
    const m = (file.name || '').match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    const t = (file.type || '').split('/')[1] || 'bin';
    return t.replace(/[^a-z0-9]/gi, '') || 'bin';
  }
  function _uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  // Last opp en fil. Returnerer { url, path, type, size }. Krever eier-token
  // (opplasting er kun for Ambient Mann). Kaster 'not-configured' uten Supabase.
  async function upload(file, opts) {
    opts = opts || {};
    if (!isConfigured()) throw new Error('not-configured');
    if (opts.onProgress) opts.onProgress(0);

    const path = (opts.prefix || 'media') + '/' + _uuid() + '.' + _ext(file);

    // 1) Be serveren (service_role) om signert opplastings-URL – eier-gated.
    const resp = await Owner.authFetch('/api/site?action=upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path }),
    });
    const info = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(info.error || ('upload-url HTTP ' + resp.status));

    // 2) Last opp bytene direkte til Supabase.
    const { error } = await client()
      .storage.from(info.bucket)
      .uploadToSignedUrl(info.path, info.token, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
    if (error) throw new Error(error.message || 'Opplasting feilet');

    if (opts.onProgress) opts.onProgress(1);
    return { url: info.publicUrl, path: info.path, type: file.type, size: file.size };
  }

  return { isConfigured, upload, client };
})();
