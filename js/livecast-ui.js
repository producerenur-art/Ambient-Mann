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

    go.addEventListener('click', () => {
      if (!stream) { log('⚠️ Gi tilgang til lyd først.'); return; }
      try {
        LiveCast.goLive(stream, {
          onListeners: (n) => { if (listenersEl) listenersEl.textContent = n + (n === 1 ? ' listener' : ' listeners'); },
          onLog: log,
        });
        go.style.display = 'none';
        stop.style.display = '';
        UI.toast('🔴 You are live (browser) on ambientmann.com');
      } catch (e) { log('❌ Kunne ikke gå live: ' + e.message); }
    });

    stop.addEventListener('click', () => {
      LiveCast.stopLive();
      stream = null;
      go.style.display = '';
      go.disabled = true;
      stop.style.display = 'none';
      if (metersRow) metersRow.style.display = 'none';
      if (listenersEl) listenersEl.textContent = '';
      log('■ Stoppet.');
    });
  }

  // ---- Offentleg banner -------------------------------------------------
  function bindPublicBanner() {
    const banner = document.getElementById('wl-banner');
    if (!banner) return;
    const tuneInBtn = document.getElementById('wl-tunein');
    const tuneOutBtn = document.getElementById('wl-tuneout');

    bannerWatch = LiveCast.watchLiveStatus((live) => {
      // Ikke skjul banneret midt i en aktiv lytteøkt sjølv om presence-
      // synkroniseringa er eit lite auga bak (tunedIn = lokalt tilstandsflagg,
      // ikke avhengig av presence-sync-timinga).
      banner.style.display = (live || tunedIn) ? '' : 'none';
    });

    tuneInBtn && tuneInBtn.addEventListener('click', () => {
      try {
        LiveCast.tuneIn({
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
    });
  }

  function bind() {
    bindOwnerPanel();
    bindPublicBanner();
  }

  return { bind };
})();
