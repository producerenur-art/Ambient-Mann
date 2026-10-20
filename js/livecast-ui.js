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
    return 'Ambient Mann - Live ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function startRecording(s) {
    if (!window.MediaRecorder) { log('⚠️ Nettleseren støtter ikke opptak.'); return; }
    // m4a (AAC) først: spilles på alle enheter og er spolbar uten reparasjon (testet i Chrome 155 over HTTP).
    // webm/opus er reserve, og repareres da i Tracks.addRecording.
    const mime = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    recChunks = []; recStart = Date.now();
    idbClear();
    try { rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : {}); }
    catch (_) { rec = new MediaRecorder(s); }
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
  // Nedlastingslenke slik at et opptak aldri går tapt om lagringen feiler.
  function offerDownload(r) {
    const el = document.getElementById('wl-log');
    if (!el || !r || !r.blob) return;
    const ext = /mp4|aac/.test(r.blob.type) ? 'm4a' : 'webm';
    const a = document.createElement('a');
    a.className = 'btn btn-tiny';
    a.href = URL.createObjectURL(r.blob);
    a.download = recTitle(r.start).replace(/[^a-z0-9]+/gi, '-') + '.' + ext;
    a.textContent = '⬇ Download recording to this computer';
    el.parentNode.insertBefore(a, el);
  }
  async function saveRecording(r) {
    if (!r || !r.blob.size) { log('⚠️ Opptaket var tomt (ingen lyd tatt opp).'); return; }
    try {
      log('⏫ Laster opp opptaket (' + (r.blob.size / 1048576).toFixed(1) + ' MB) …');
      let last = -1;
      const meta = await Tracks.addRecording(r.blob, recTitle(r.start), p => { const v = Math.round(p * 10); if (v !== last) { last = v; log('   ' + v * 10 + '%'); } });
      // Verifiser at sporet faktisk ligger på serveren (ikke bare i denne fanen).
      const back = await fetch('/api/site?action=content-get&_=' + Date.now()).then(x => x.json()).catch(() => null);
      const ok = back && Array.isArray(back.tracks) && back.tracks.some(t => t.id === meta.id);
      if (!ok) throw new Error('sporet ble ikke funnet på serveren etter lagring');
      await idbClear();
      log('✅ Opptaket ligger nå i spor-lista: «' + meta.title + '» (Edit for cover/navn, 🔗 for å dele).');
      log(meta.seekable ? '✅ Spolefeltet virker (lengde + søkeinfo lagt inn).' : '⚠️ Kunne ikke gjøre opptaket spolbart automatisk – trykk «Fix seek» ved sporet.');
      UI.toast('Recording saved to the track list.');
    } catch (e) {
      log('❌ Kunne ikke lagre opptaket: ' + (e && e.message ? e.message : e) + ' — opptaket er beholdt lokalt (se «Recover»/«Download» over loggen).');
      offerDownload(r);
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

  // ---- Sjekkliste før live ---------------------------------------------------
  // Alt som spilles på Mac-en går via BlackHole og havner i sendinga (varsler, plinger).
  // Siden kan ikke slå av noe selv – dette er en påminnelse du må bekrefte før start.
  const CHECKS = [
    'Do Not Disturb is ON (Control Center → Focus)',
    'Messages, Slack, Mail and other chat apps are closed',
    'Chrome site notifications are blocked',
    'I will not change the audio device or close this tab while live',
  ];
  function confirmChecklist() {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'share-back';
      const box = document.createElement('div');
      box.className = 'share-menu';
      const head = document.createElement('div');
      head.className = 'share-title';
      head.textContent = 'Before you go live';
      box.appendChild(head);
      const note = document.createElement('p');
      note.className = 'muted';
      note.style.margin = '4px 0 10px';
      note.textContent = 'Everything your Mac plays – notification dings included – goes into the broadcast.';
      box.appendChild(note);
      const boxes = CHECKS.map(txt => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin:8px 0;cursor:pointer';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.style.marginTop = '3px';
        row.appendChild(cb); row.appendChild(document.createTextNode(txt));
        box.appendChild(row);
        return cb;
      });
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
      const start = document.createElement('button');
      start.className = 'btn btn-primary'; start.textContent = '📡 Go live'; start.disabled = true;
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost'; cancel.textContent = 'Cancel';
      btns.appendChild(start); btns.appendChild(cancel); box.appendChild(btns);
      function done(v) { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      boxes.forEach(cb => cb.addEventListener('change', () => { start.disabled = !boxes.every(b => b.checked); }));
      start.addEventListener('click', () => done(true));
      cancel.addEventListener('click', () => done(false));
      back.addEventListener('click', e => { if (e.target === back) done(false); });
      document.addEventListener('keydown', onKey);
      back.appendChild(box); document.body.appendChild(back);
    });
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
      if (!(await confirmChecklist())) { log('Avbrutt – ikke live.'); return; }
      try {
        await LiveCast.goLive(stream, {
          onListeners: (n) => { if (listenersEl) listenersEl.textContent = n + (n === 1 ? ' listener' : ' listeners'); },
          onLog: log,
        });
        const recBox = document.getElementById('wl-record');
        if (!recBox || recBox.checked) startRecording(stream); else log('Opptak er av for denne sendinga.');
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
    const center = document.getElementById('wl-center');
    const centerPlay = document.getElementById('wl-center-play');
    const centerClose = document.getElementById('wl-center-close');
    let isLive = false, dismissed = false;
    try { dismissed = sessionStorage.getItem('am_wl_dismissed') === '1'; } catch (_) {}

    // Midt-på-skjermen-knappen vises til alle som ikke allerede lytter eller har sagt «Not now».
    // Eieren (som selv sender) får den aldri – ellers ville han startet tilbakekobling.
    function paint() {
      const own = !!(window.LiveCast && LiveCast.isLive && LiveCast.isLive());
      const showCenter = isLive && !tunedIn && !dismissed && !own;
      if (center) center.style.display = showCenter ? '' : 'none';
      banner.style.display = ((isLive && !own && (tunedIn || dismissed)) || tunedIn) ? '' : 'none';
    }

    const startWatch = () => {
      bannerWatch = LiveCast.watchLiveStatus((live) => {
        isLive = !!live;
        paint();
      });
    };
    startWatch();

    async function doTuneIn() {
      try {
        await LiveCast.tuneIn({
          onTrack: (remoteStream) => {
            if (!tuneAudioEl) { tuneAudioEl = new Audio(); tuneAudioEl.autoplay = true; tuneAudioEl.setAttribute('playsinline', ''); }
            tuneAudioEl.srcObject = remoteStream;
            tuneAudioEl.muted = false; tuneAudioEl.volume = 1;
            tuneAudioEl.play().catch(() => {});
          },
          onState: (state) => { if (state === 'failed' || state === 'closed') { tuneOutBtn.click(); } },
          onLog: (m) => console.log('[LiveCast listener]', m),
        });
        tunedIn = true;
        tuneInBtn.style.display = 'none';
        tuneOutBtn.style.display = '';
        paint();
        UI.toast('🎧 Connecting to the live browser stream…');
      } catch (e) { UI.toast('Could not connect: ' + e.message); }
    }

    tuneInBtn && tuneInBtn.addEventListener('click', doTuneIn);
    centerPlay && centerPlay.addEventListener('click', doTuneIn);
    centerClose && centerClose.addEventListener('click', () => {
      dismissed = true;
      try { sessionStorage.setItem('am_wl_dismissed', '1'); } catch (_) {}
      paint();
    });

    tuneOutBtn && tuneOutBtn.addEventListener('click', () => {
      LiveCast.tuneOut();
      tunedIn = false;
      dismissed = true; // brukeren stoppet selv – ikke pop opp igjen
      if (tuneAudioEl) { tuneAudioEl.pause(); tuneAudioEl.srcObject = null; }
      tuneInBtn.style.display = '';
      tuneOutBtn.style.display = 'none';
      paint();
      setTimeout(startWatch, 800); // tuneIn rev ned vakt-kanalen; start den på nytt
    });
  }

  function bind() {
    bindOwnerPanel();
    bindPublicBanner();
  }

  return { bind };
})();
