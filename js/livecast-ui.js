/* =========================================================================
 * AMBIENT MANN — LiveCast UI: eigar-panel («Go live now from your browser»)
 * + offentleg banner («Ambient Mann is live now — Listen»). Sjølve WebRTC-
 * logikken bor i js/livecast.js (LiveCast); denne fila kun kobler DOM-en.
 * ========================================================================= */
window.LiveCastUI = (function () {
  let stream = null;
  let bannerWatch = null;
  let tuneAudioEl = null;
  let tunedIn = false;

  function log(msg) {
    const el = document.getElementById('wl-log');
    if (!el) return;
    el.textContent += (el.textContent ? '\n' : '') + msg;
    el.scrollTop = el.scrollHeight;
  }

  // ---- Eigar-panel ----------------------------------------------------------
  async function refreshDeviceList(selectId) {
    const devices = await LiveCast.listInputDevices();
    const els = document.getElementById(selectId);
    if (!els) return;
    els.innerHTML = devices.length
      ? devices.map(d => '<option value="' + UI.esc(d.deviceId) + '">' + UI.esc(d.label || 'Microphone') + '</option>').join('')
      : '<option value="">No audio inputs found</option>';
    // Foreslå BlackHole/loopback-enheiter automatisk, same som Sirius.
    const guess = devices.find(d => /blackhole|loopback|soundflower|aggregate/i.test(d.label || ''));
    if (guess) els.value = guess.deviceId;
  }

  function setMeter(id, level) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = Math.min(100, Math.round(level * 220)) + '%';
  }

  // ---- Opptak av sendinga -------------------------------------------------
  // MediaRecorder tar opp same lydstrøm som går live. Bitar lagres fortløpande
  // i IndexedDB slik at eit opptak overlever refresh/krasj (kan gjenopprettast).
  // Ved Stop lastast opptaket opp og legg seg i spor-lista (Tracks.addRecording).
  let rec = null, recChunks = [], recStart = 0;
  const IDB = { name: 'am-livecast-rec', store: 'chunks' };
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB.store, { autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(v) { try { const d = await idb(); d.transaction(IDB.store, 'readwrite').objectStore(IDB.store).add(v); } catch (_) {} }
  async function idbAll() {
    try {
      const d = await idb();
      return await new Promise(res => { const q = d.transaction(IDB.store).objectStore(IDB.store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
    } catch (_) { return []; }
  }
  async function idbClear() { try { const d = await idb(); d.transaction(IDB.store, 'readwrite').objectStore(IDB.store).clear(); } catch (_) {} }

  function recTitle(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return 'Live ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
  }
  function startRecording(s) {
    if (!window.MediaRecorder) { log('⚠️ Nettleseren støtter ikke opptak.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m));
    recChunks = []; recStart = Date.now();
    idbClear();
    rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : {});
    rec.ondataavailable = (e) => { if (e.data && e.data.size) { recChunks.push(e.data); idbPut({ blob: e.data, type: rec.mimeType, start: recStart }); } };
    rec.start(10000);
    log('⏺ Tar opp sendinga (lagres som spor når du stopper).');
  }
  function stopRecording() {
    return new Promise(resolve => {
      if (!rec || rec.state === 'inactive') { resolve(null); return; }
      const r = rec, start = recStart;
      r.onstop = () => { resolve({ blob: new Blob(recChunks, { type: r.mimeType }), start }); };
      r.stop(); rec = null;
    });
  }
  async function saveRecording(r) {
    if (!r || !r.blob.size) return;
    try {
      log('⏫ Laster opp opptaket (' + Math.round(r.blob.size / 1048576) + ' MB) …');
      let last = -1;
      const meta = await Tracks.addRecording(r.blob, recTitle(r.start), p => { const v = Math.round(p * 10); if (v !== last) { last = v; log('   ' + v * 10 + '%'); } });
      await idbClear();
      log('✅ Opptaket ligger nå i spor-lista: «' + meta.title + '» (Edit for cover/navn, 🔗 for å dele).');
      UI.toast('Recording saved to the track list.');
    } catch (e) {
      log('❌ Kunne ikke lagre opptaket: ' + (e && e.message ? e.message : e) + ' — det er beholdt lokalt, last siden på nytt og trykk «Recover».');
    }
  }
  async function offerRecovery() {
    if (!window.Owner || !Owner.isOwner()) return;
    const parts = await idbAll();
    if (!parts.length || rec) return;
    const log0 = document.getElementById('wl-log');
    if (!log0) return;
    log('⚠️ Fant et ikke-lagret live-opptak fra ' + recTitle(parts[0].start) + '.');
    const b = document.createElement('button');
    b.className = 'btn btn-tiny'; b.textContent = 'Recover recording';
    b.onclick = async () => { b.remove(); await saveRecording({ blob: new Blob(parts.map(p => p.blob), { type: parts[0].type }), start: parts[0].start }); };
    log0.parentNode.insertBefore(b, log0);
  }

  function bindOwnerPanel() {
    const grant = document.getElementById('wl-grant');
    const go = document.getElementById('wl-go');
    const stop = document.getElementById('wl-stop');
    const listenersEl = document.getElementById('wl-listeners');
    const metersRow = document.getElementById('wl-meters');
    if (!grant || !go || !stop) return; // owner-only markup ikke i DOM-en

    grant.addEventListener('click', async () => {
      try {
        if (!LiveCast.supaOk()) { log('⚠️ Supabase er ikke satt opp — kan ikke sende live fra nettleseren.'); return; }
        await navigator.mediaDevices.getUserMedia({ audio: true }); // trigger permission for labels
        await refreshDeviceList('wl-device');
        const deviceId = document.getElementById('wl-device').value;
        stream = await LiveCast.grantAccess(deviceId, (l, r) => { setMeter('wl-meter-l', l); setMeter('wl-meter-r', r); });
        if (metersRow) metersRow.style.display = '';
        go.disabled = false;
        log('✅ Tilgang gitt — nivåmålerne over bør bevege seg når lyd spilles.');
      } catch (e) {
        log('❌ Fikk ikke tilgang: ' + (e && e.message ? e.message : e));
      }
    });

    document.getElementById('wl-device') && document.getElementById('wl-device').addEventListener('change', async () => {
      if (!stream) return;
      try {
        const deviceId = document.getElementById('wl-device').value;
        stream.getTracks().forEach(t => t.stop());
        stream = await LiveCast.grantAccess(deviceId, (l, r) => { setMeter('wl-meter-l', l); setMeter('wl-meter-r', r); });
      } catch (e) { log('❌ Kunne ikke bytte enhet: ' + e.message); }
    });

    go.addEventListener('click', async () => {
      if (!stream) { log('⚠️ Gi tilgang til lyd først.'); return; }
      try {
        await LiveCast.goLive(stream, {
          onListeners: (n) => { if (listenersEl) listenersEl.textContent = n + (n === 1 ? ' listener' : ' listeners'); },
          onLog: log,
        });
        startRecording(stream);
        go.style.display = 'none';
        stop.style.display = '';
        UI.toast('🔴 You are live (browser) on ambientmann.com');
      } catch (e) { log('❌ Kunne ikke gå live: ' + e.message); }
    });

    stop.addEventListener('click', async () => {
      LiveCast.stopLive();
      const recorded = await stopRecording();
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      go.style.display = '';
      go.disabled = true;
      stop.style.display = 'none';
      if (metersRow) metersRow.style.display = 'none';
      if (listenersEl) listenersEl.textContent = '';
      log('■ Stoppet.');
      saveRecording(recorded);
    });
    offerRecovery();
  }

  // ---- Offentleg banner -------------------------------------------------
  function bindPublicBanner() {
    const banner = document.getElementById('wl-banner');
    if (!banner) return;
    const tuneInBtn = document.getElementById('wl-tunein');
    const tuneOutBtn = document.getElementById('wl-tuneout');

    const startWatch = () => {
      bannerWatch = LiveCast.watchLiveStatus((live) => {
        // Ikke skjul banneret midt i en aktiv lytteøkt sjølv om presence-
        // synkroniseringa er eit lite auga bak (tunedIn = lokalt tilstandsflagg,
        // ikke avhengig av presence-sync-timinga).
        banner.style.display = (live || tunedIn) ? '' : 'none';
      });
    };
    startWatch();

    tuneInBtn && tuneInBtn.addEventListener('click', async () => {
      try {
        await LiveCast.tuneIn({
          onTrack: (remoteStream) => {
            if (!tuneAudioEl) { tuneAudioEl = new Audio(); tuneAudioEl.autoplay = true; }
            tuneAudioEl.srcObject = remoteStream;
            tuneAudioEl.play().catch(() => {});
          },
          onState: (state) => { if (state === 'failed' || state === 'closed') { tuneOutBtn.click(); } },
          onLog: (m) => console.log('[LiveCast listener]', m),
        });
        tunedIn = true;
        tuneInBtn.style.display = 'none';
        tuneOutBtn.style.display = '';
        UI.toast('🎧 Connecting to the live browser stream…');
      } catch (e) { UI.toast('Could not connect: ' + e.message); }
    });

    tuneOutBtn && tuneOutBtn.addEventListener('click', () => {
      LiveCast.tuneOut();
      tunedIn = false;
      if (tuneAudioEl) { tuneAudioEl.pause(); tuneAudioEl.srcObject = null; }
      tuneInBtn.style.display = '';
      tuneOutBtn.style.display = 'none';
      setTimeout(startWatch, 800); // tuneIn rev ned vakt-kanalen; start den på nytt
    });
  }

  function bind() {
    bindOwnerPanel();
    bindPublicBanner();
  }

  return { bind };
})();
