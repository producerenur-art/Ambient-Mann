/* =========================================================================
 * AMBIENT MANN — besøkstall (teller for alle, KUN eier ser tallene)
 * Sender én stille ping per sideåpning til /api/site?action=visit. Flagget
 * «fresh» settes første gang enheten er innom en gitt dag, slik at vi får
 * både sidevisninger og unike besøkende. Ingen personopplysninger lagres —
 * bare datoen i localStorage lokalt, og to tall per dag hos oss.
 * Panelet i Musikk-seksjonen er .owner-only, altså skjult for alle andre.
 * ========================================================================= */
window.Visits = (function () {
  const DAY_KEY = 'am_visit_day';
  let pinged = false;

  function today() { return new Date().toISOString().slice(0, 10); }

  // Teller besøket. Kalles én gang per sideåpning, fyr-og-glem.
  function ping() {
    if (pinged) return;
    pinged = true;
    let fresh = true;
    try {
      fresh = localStorage.getItem(DAY_KEY) !== today();
      if (fresh) localStorage.setItem(DAY_KEY, today());
    } catch (_) {}
    try {
      fetch('/api/site?action=visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fresh: fresh }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  function pretty(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    if (iso === today()) return 'Today';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  async function render() {
    const card = document.getElementById('visits-card');
    if (!card || !Owner.isOwner()) return;   // panelet er uansett .owner-only-skjult
    const listEl = document.getElementById('visits-list');
    const sumEl = document.getElementById('visits-summary');
    if (listEl) listEl.innerHTML = '<p class="muted">Loading …</p>';

    let d = null;
    try {
      const r = await Owner.authFetch('/api/site?action=visits');
      d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.error) || 'Error');
    } catch (_) {
      if (sumEl) sumEl.innerHTML = '';
      if (listEl) listEl.innerHTML = '<p class="muted">Could not load visitor numbers.</p>';
      return;
    }

    if (d && d.ready === false) {
      if (sumEl) sumEl.innerHTML = '';
      if (listEl) listEl.innerHTML = '<p class="muted">Visitor counting is not set up yet — ' +
        'run <code>supabase/migrations/0004_visits.sql</code> in the Supabase SQL editor.</p>';
      return;
    }

    const stat = (label, v) =>
      '<div class="visits-stat"><span class="visits-stat-num">' + ((v && v.visitors) || 0) + '</span>' +
      '<span class="visits-stat-label">' + label + '</span>' +
      '<span class="visits-stat-sub">' + ((v && v.views) || 0) + ' views</span></div>';

    if (sumEl) {
      sumEl.innerHTML =
        stat('Today', d.today) + stat('Last 7 days', d.week) +
        stat('Last 30 days', d.month) + stat('All time', d.total);
    }

    const days = (d && d.days) || [];
    if (!listEl) return;
    if (!days.length) {
      listEl.innerHTML = '<p class="muted">No visits recorded yet.</p>';
      return;
    }
    listEl.innerHTML = days.map(x =>
      '<div class="plays-row"><span class="plays-title">' + UI.esc(pretty(x.day)) + '</span>' +
      '<span class="plays-count">' + x.visitors + ' <span class="hint">(' + x.views + ' views)</span></span></div>'
    ).join('');
  }

  function bind() {
    const btn = document.getElementById('visits-refresh');
    if (btn) btn.addEventListener('click', render);
  }

  return { ping, render, bind };
})();
