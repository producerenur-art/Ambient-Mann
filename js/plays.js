/* =========================================================================
 * AMBIENT MANN — avspillingstall (KUN eier)
 * Henter hvor mange ganger hvert spor er spilt av (bak eier-token) og viser
 * en liten oversikt i Musikk-seksjonen. Panelet er .owner-only, så det er
 * skjult for alle andre. Ingen personopplysninger – bare en teller per spor.
 * ========================================================================= */
window.Plays = (function () {
  async function render() {
    const card = document.getElementById('plays-card');
    if (!card || !Owner.isOwner()) return;   // panelet er uansett .owner-only-skjult
    const listEl = document.getElementById('plays-list');
    const totalEl = document.getElementById('plays-total');
    if (listEl) listEl.innerHTML = '<p class="muted">Laster …</p>';

    let d = null;
    try {
      const r = await Owner.authFetch('/api/site?action=plays');
      d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.error) || 'Feil');
    } catch (_) {
      if (totalEl) totalEl.textContent = '';
      if (listEl) listEl.innerHTML = '<p class="muted">Kunne ikke hente avspillinger.</p>';
      return;
    }

    const plays = (d && d.plays) || [];
    const total = (d && d.total) || 0;
    if (totalEl) totalEl.textContent = 'Totalt: ' + total + ' avspilling' + (total === 1 ? '' : 'er');
    if (!listEl) return;
    if (!plays.length) {
      listEl.innerHTML = '<p class="muted">Ingen avspillinger registrert ennå.</p>';
      return;
    }
    listEl.innerHTML = plays.map(p =>
      '<div class="plays-row"><span class="plays-title">' + UI.esc(p.title || p.id) + '</span>' +
      '<span class="plays-count">' + p.count + '</span></div>'
    ).join('');
  }

  function bind() {
    const btn = document.getElementById('plays-refresh');
    if (btn) btn.addEventListener('click', render);
  }

  return { render, bind };
})();
