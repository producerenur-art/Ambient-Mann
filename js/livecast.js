/* =========================================================================
 * AMBIENT MANN — WebRTC-live rett fra nettleseren (LiveCast)
 * -------------------------------------------------------------------------
 * SEPARAT, EGEN implementasjon for ambientmann.com — brukerønske 27.09.2026:
 * "samme lydoppsett i Ambient Mann som i Sirius, bare separert siden det er
 * 2 forskjellige sider". Dette er IKKE en import av SiriusFM sin kode (den
 * bor i et annet repo, ~/kode/blind/Desktop/side prosjekt/js/livebroadcast.js
 * og skal IKKE røres) — samme TEKNIKK er gjenskapt fra bunnen av her, mot
 * Ambient Manns eget Supabase-prosjekt (SC_Storage.client(), se js/storage.js).
 *
 * Legges TIL VED SIDEN AV det eksisterende Traktor→BUTT→AzuraCast-oppsettet
 * ([[ambient-mann-live-test-setup]]) — IKKE en erstatning. AzuraCast-strømmen
 * krever ikke at nettleseren er åpen; denne WebRTC-veien er et raskere
 * alternativ for korte økter rett fra nettleseren, uten Traktor+BUTT+VPS.
 *
 * Arkitektur (mesh, samme mønster som Sirius er beskrevet å bruke):
 *   Eier-nettleser fanger lyd (getUserMedia, DSP av — se grantAccess()) →
 *   ÉN RTCPeerConnection PER lytter → Supabase Realtime broadcast-kanal som
 *   signalering (tilbud/svar/ICE) → lytterens <audio> spiller mottatt spor.
 * Skalerer IKKE til hundrevis av lyttere samtidig (mesh, ikke SFU) — fint for
 * en liten publikumsgruppe, som er den faktiske bruken her.
 *
 * ADVARSEL (samme forbehold som Sirius sin egen byggelogg): selve lyd/WebRTC-
 * banen er ALDRI testet ende-til-ende i ekte nettlesere herfra (krever mic-
 * tilgang + en faktisk lytter på en annen enhet — ikke automatiserbart fra
 * dette miljøet). Signaleringslogikken er verifiserbar (Supabase Realtime
 * broadcast virker med anon-nøkkelen), selve avspillingen må testes manuelt.
 * ========================================================================= */
window.LiveCast = (function () {
  const ROOM = 'amlive:main'; // fast, éin kanal — kun Ambient Mann sjølv sender

  function myId() {
    try {
      let id = sessionStorage.getItem('am_wl_id');
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2))); sessionStorage.setItem('am_wl_id', id); }
      return id;
    } catch (_) { return 'anon-' + Math.random().toString(36).slice(2); }
  }

  function iceServers() {
    const C = window.AM_CONFIG || {};
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    if (C.TURN_URL && C.TURN_USERNAME && C.TURN_CREDENTIAL) {
      servers.push({ urls: C.TURN_URL, username: C.TURN_USERNAME, credential: C.TURN_CREDENTIAL });
    } else {
      // Gratis Open Relay-fallback (delt/rate-begrenset) — fleire transportar
      // (UDP/TCP/TLS) for betre NAT/brannmur-traversering. Eiga TURN er rett
      // veg for ekte produksjon i stor skala, men held for ei lita gruppe.
      servers.push(
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      );
    }
    return servers;
  }

  function supaOk() {
    return !!(window.SC_Storage && SC_Storage.isConfigured());
  }

  // ---- Lydfangst (eigar-sida) ---------------------------------------------
  // Same prinsipp som Sirius: DSP AV, elles øydelegg nettlesaren musikken.
  async function grantAccess(deviceId, onLevel) {
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (onLevel) _startMeter(stream, onLevel);
    return stream;
  }

  async function listInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  let _meterCtx = null, _meterRaf = null;
  function _startMeter(stream, onLevel) {
    _stopMeter();
    _meterCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = _meterCtx.createMediaStreamSource(stream);
    const splitter = _meterCtx.createChannelSplitter(2);
    const analyserL = _meterCtx.createAnalyser(); analyserL.fftSize = 512;
    const analyserR = _meterCtx.createAnalyser(); analyserR.fftSize = 512;
    src.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    const bufL = new Uint8Array(analyserL.frequencyBinCount);
    const bufR = new Uint8Array(analyserR.frequencyBinCount);
    const tick = () => {
      analyserL.getByteTimeDomainData(bufL);
      analyserR.getByteTimeDomainData(bufR);
      const rms = (buf) => {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        return Math.sqrt(sum / buf.length);
      };
      onLevel(rms(bufL), rms(bufR));
      _meterRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function _stopMeter() {
    if (_meterRaf) cancelAnimationFrame(_meterRaf);
    _meterRaf = null;
    if (_meterCtx) { try { _meterCtx.close(); } catch (_) {} _meterCtx = null; }
  }

  // ---- Signalering (Supabase Realtime broadcast) --------------------------
  function _channel() {
    return SC_Storage.client().channel(ROOM, { config: { broadcast: { self: false }, presence: { key: myId() } } });
  }

  // supabase-js gjenbruker en eksisterende kanal med samme topic. Banner-vakta
  // (watchLiveStatus) har da allerede subscribet den, og goLive/tuneIn kan ikke
  // legge til presence-callbacks etterpå («cannot add presence callbacks after
  // subscribe()»). Riv derfor ned den gamle kanalen først og lag en fersk.
  async function _freshChannel() {
    const cl = SC_Storage.client();
    const topic = 'realtime:' + ROOM;
    const old = cl.getChannels().filter(c => c.topic === topic);
    for (const c of old) { try { await cl.removeChannel(c); } catch (_) {} }
    return _channel();
  }

  // Sjekk raskt om nokon sender akkurat no (presence), utan å opne WebRTC.
  // Brukast av den offentlege banneret for å avgjere om «Lytt live»-knappen
  // skal visast, uten at kvar besøkande opnar ei fangst-tilkobling for ingenting.
  function watchLiveStatus(cb) {
    const ch = _channel();
    let stopped = false;
    const check = () => {
      if (stopped) return;
      const state = ch.presenceState();
      const live = Object.values(state).some(arr => arr.some(p => p.role === 'broadcaster'));
      cb(live);
    };
    ch.on('presence', { event: 'sync' }, check);
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') check(); });
    return { stop() { stopped = true; try { ch.unsubscribe(); } catch (_) {} } };
  }

  // ---- Kringkastar (eigar) -------------------------------------------------
  let _bc = null; // { channel, peers:Map, stream }

  async function goLive(stream, { onListeners, onLog } = {}) {
    if (!supaOk()) throw new Error('Supabase er ikke satt opp (SUPABASE_URL/ANON_KEY i js/config.js).');
    if (_bc) throw new Error('Already live.');
    const log = (m) => { try { onLog && onLog(m); } catch (_) {} };
    const peers = new Map(); // listenerId -> RTCPeerConnection
    const ch = await _freshChannel();
    if (_bc) throw new Error('Already live.');
    const id = myId();

    function countListeners() {
      const state = ch.presenceState();
      let n = 0;
      Object.values(state).forEach(arr => arr.forEach(p => { if (p.role === 'listener') n++; }));
      return n;
    }

    async function createPeerFor(listenerId) {
      if (peers.has(listenerId)) return;
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      peers.set(listenerId, pc);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) ch.send({ type: 'broadcast', event: 'ice', payload: { from: id, to: listenerId, candidate: e.candidate } });
      };
      pc.onconnectionstatechange = () => {
        log('Listener ' + listenerId.slice(0, 6) + ': ' + pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { peers.delete(listenerId); pc.close(); }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ch.send({ type: 'broadcast', event: 'offer', payload: { from: id, to: listenerId, sdp: offer } });
    }

    ch.on('broadcast', { event: 'listener-hello' }, ({ payload }) => {
      log('New listener joining…');
      createPeerFor(payload.from);
    });
    ch.on('broadcast', { event: 'answer' }, ({ payload }) => {
      if (payload.to !== id) return;
      const pc = peers.get(payload.from);
      if (pc) pc.setRemoteDescription(payload.sdp).catch(e => log('setRemoteDescription feil: ' + e.message));
    });
    ch.on('broadcast', { event: 'ice' }, ({ payload }) => {
      if (payload.to !== id) return;
      const pc = peers.get(payload.from);
      if (pc) pc.addIceCandidate(payload.candidate).catch(() => {});
    });
    ch.on('presence', { event: 'sync' }, () => { try { onListeners && onListeners(countListeners()); } catch (_) {} });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ role: 'broadcaster', startedAt: Date.now() });
        log('Live — venter på lyttere…');
      }
    });

    _bc = {
      channel: ch, peers,
      stop() {
        peers.forEach(pc => { try { pc.close(); } catch (_) {} });
        peers.clear();
        try { ch.unsubscribe(); } catch (_) {}
        stream.getTracks().forEach(t => t.stop());
        _stopMeter();
        _bc = null;
      },
    };
    return _bc;
  }

  function stopLive() { if (_bc) _bc.stop(); }
  function isLive() { return !!_bc; }

  // ---- Lyttar ---------------------------------------------------------------
  let _ln = null; // { channel, pc }

  async function tuneIn({ onTrack, onState, onLog } = {}) {
    if (!supaOk()) throw new Error('Supabase er ikke satt opp.');
    if (_ln) return _ln;
    const log = (m) => { try { onLog && onLog(m); } catch (_) {} };
    const id = myId();
    const ch = await _freshChannel();
    if (_ln) return _ln;
    let pc = null;
    let broadcasterId = null;

    ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== id) return;
      broadcasterId = payload.from;
      pc = new RTCPeerConnection({ iceServers: iceServers() });
      pc.ontrack = (e) => { try { onTrack && onTrack(e.streams[0]); } catch (_) {} };
      pc.onicecandidate = (e) => {
        if (e.candidate) ch.send({ type: 'broadcast', event: 'ice', payload: { from: id, to: broadcasterId, candidate: e.candidate } });
      };
      pc.onconnectionstatechange = () => { log('Tilkobling: ' + pc.connectionState); try { onState && onState(pc.connectionState); } catch (_) {} };
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ch.send({ type: 'broadcast', event: 'answer', payload: { from: id, to: broadcasterId, sdp: answer } });
    });
    ch.on('broadcast', { event: 'ice' }, ({ payload }) => {
      if (payload.to !== id || !pc) return;
      pc.addIceCandidate(payload.candidate).catch(() => {});
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ role: 'listener' });
        ch.send({ type: 'broadcast', event: 'listener-hello', payload: { from: id } });
        log('Ber om tilkobling…');
      }
    });

    _ln = {
      channel: ch,
      leave() {
        if (pc) { try { pc.close(); } catch (_) {} }
        try { ch.unsubscribe(); } catch (_) {}
        _ln = null;
      },
    };
    return _ln;
  }

  function tuneOut() { if (_ln) _ln.leave(); }

  return {
    supaOk, grantAccess, listInputDevices,
    watchLiveStatus, goLive, stopLive, isLive,
    tuneIn, tuneOut,
  };
})();
