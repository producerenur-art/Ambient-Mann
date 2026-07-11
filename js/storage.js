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

  // Last opp bytene rett til Supabase via XHR mot den signerte opplastings-URL-en.
  // Vi bruker XHR (ikke supabase-js/fetch) fordi KUN XHR gir ekte opplastings-
  // fremdrift (upload.onprogress). Store lydfiler (100–200 MB) tar tid; uten
  // fremdrift ser det ut som «ingenting skjer». Samme request-form som
  // storage-js sin uploadToSignedUrl: PUT + FormData(cacheControl + fil).
  function _putSigned(file, info, onProgress) {
    const c = _cfg();
    // Bygg samme endepunkt som storage-js: /storage/v1/object/upload/sign/<bucket>/<path>?token=…
    const base = c.url.replace(/\/+$/, '') + '/storage/v1/object/upload/sign/' +
      info.bucket + '/' + String(info.path).split('/').map(encodeURIComponent).join('/');
    const url = base + '?token=' + encodeURIComponent(info.token);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('apikey', c.anon);
      xhr.setRequestHeader('Authorization', 'Bearer ' + c.anon);
      xhr.setRequestHeader('x-upsert', 'true');
      // La nettleseren sette multipart-grensen selv – ikke sett Content-Type.
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
        let msg = 'Opplasting feilet (HTTP ' + xhr.status + ')';
        try { const j = JSON.parse(xhr.responseText); if (j && (j.message || j.error)) msg = j.message || j.error; } catch (_) {}
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Nettverksfeil under opplasting.'));
      xhr.ontimeout = () => reject(new Error('Opplasting tok for lang tid (timeout).'));
      const fd = new FormData();
      fd.append('cacheControl', '3600');
      fd.append('', file, file.name || 'upload');
      xhr.send(fd);
    });
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
    if (!info.token || !info.path || !info.bucket) throw new Error('Ugyldig svar fra server (mangler opplastings-URL).');

    // 2) Last opp bytene direkte til Supabase – med ekte fremdrift.
    try {
      await _putSigned(file, info, opts.onProgress);
    } catch (e) {
      // Reserveløsning: prøv supabase-js hvis XHR-veien ikke gikk (f.eks. eldre nettleser).
      const { error } = await client()
        .storage.from(info.bucket)
        .uploadToSignedUrl(info.path, info.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
      if (error) throw new Error((e && e.message) || error.message || 'Opplasting feilet');
    }

    if (opts.onProgress) opts.onProgress(1);
    return { url: info.publicUrl, path: info.path, type: file.type, size: file.size };
  }

  return { isConfigured, upload, client };
})();
