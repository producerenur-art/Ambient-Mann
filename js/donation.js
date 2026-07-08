/* =========================================================================
 * AMBIENT MANN — donasjon (frivillig)
 * To måter: (1) Vipps til 97253713, (2) kort via Stripe Checkout.
 * Booking er GRATIS og skjer via e-post – donasjon er helt frivillig.
 * ========================================================================= */
window.Donation = (function () {
  let amountKr = 0;

  function cfg() { return (window.AM_CONFIG && AM_CONFIG.donation) || {}; }
  function clamp(kr) {
    const c = cfg();
    return Math.max(c.minKr || 20, Math.min(c.maxKr || 10000, Math.round(kr) || 0));
  }

  function setAmount(kr) {
    amountKr = clamp(kr);
    const inp = document.getElementById('don-amount');
    if (inp) inp.value = amountKr;
    UI.$all('.don-preset').forEach(b =>
      b.classList.toggle('active', parseInt(b.getAttribute('data-kr'), 10) === amountKr));
  }

  async function payStripe() {
    const inp = document.getElementById('don-amount');
    const kr = clamp(parseInt(inp && inp.value, 10) || amountKr);
    if (!kr) { UI.toast('Velg et beløp.'); return; }
    try {
      const r = await fetch('/api/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'donation', amountKr: kr }),
      });
      if (r.status === 503) { UI.toast('Kortbetaling er ikke satt opp ennå – bruk Vipps så lenge.'); return; }
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      UI.toast(d.error || 'Kunne ikke starte betaling.');
    } catch (_) {
      UI.toast('Kortbetaling er ikke tilgjengelig her – bruk Vipps.');
    }
  }

  function vippsHref() {
    const v = (window.AM_CONFIG && AM_CONFIG.vipps) || {};
    // Dyp-lenke som åpner Vipps-appen på mobil mot mottakernummeret.
    return 'https://qr.vipps.no/28/2/03/031/' + encodeURIComponent(v.number || '');
  }

  // Etter retur fra Stripe: ?payment_success=<session_id> → takke-melding.
  async function handleReturn() {
    const p = new URLSearchParams(location.search);
    const sid = p.get('payment_success');
    if (!sid) return;
    try {
      const r = await fetch('/api/verify-session?session_id=' + encodeURIComponent(sid));
      const d = await r.json().catch(() => ({}));
      if (d && d.success) {
        const kr = d.amountTotal ? Math.round(d.amountTotal / 100) : '';
        UI.toast('Tusen takk for støtten' + (kr ? ' (' + kr + ' kr)' : '') + ' 💜');
      }
    } catch (_) {}
    // Rydd URL-en
    history.replaceState({}, '', location.pathname + location.hash);
  }

  function bind() {
    UI.$all('.don-preset').forEach(b =>
      b.addEventListener('click', () => setAmount(parseInt(b.getAttribute('data-kr'), 10))));
    const inp = document.getElementById('don-amount');
    if (inp) inp.addEventListener('input', () => { amountKr = clamp(parseInt(inp.value, 10) || 0); });
    const s = document.getElementById('don-stripe');
    if (s) s.addEventListener('click', payStripe);
    const v = document.getElementById('don-vipps');
    if (v) v.setAttribute('href', vippsHref());
    // QR-koden peker til samme Vipps-dyplenke som knappen.
    const qLink = document.getElementById('don-qr-link');
    if (qLink) qLink.setAttribute('href', vippsHref());
    const qImg = document.getElementById('don-qr-img');
    const qSrc = (window.AM_CONFIG && AM_CONFIG.vipps && AM_CONFIG.vipps.qr);
    if (qImg && qSrc) qImg.setAttribute('src', qSrc);
    const presets = cfg().presets || [];
    if (presets.length) setAmount(presets[0]);
  }

  return { bind, handleReturn, setAmount };
})();
