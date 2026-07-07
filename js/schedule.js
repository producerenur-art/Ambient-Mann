/* =========================================================================
 * AMBIENT MANN — sendeplan (når han går live via Traktor)
 * Ambient Mann setter sine egne sendetider (kun når han er logget inn).
 * Publikum ser kommende + pågående sendinger. «Er live NÅ» bekreftes både av
 * planlagt vindu OG av den ekte strømmen (Player.isLive()).
 * ========================================================================= */
window.Schedule = (function () {
  const GRACE_MIN = 15;   // regnes som «live» inntil 15 min etter planlagt slutt

  function entries() {
    const arr = (window.Content && Content.get('schedule')) || [];
    return arr.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function statusOf(e) {
    const start = new Date(e.start).getTime();
    const end = start + (Number(e.hours) || 1) * 3600e3 + GRACE_MIN * 60e3;
    const now = Date.now();
    if (isNaN(start)) return 'past';
    if (now < start) return 'upcoming';
    if (now <= end) return 'live';
    return 'past';
  }

  function fmt(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('no-NO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function render() {
    const wrap = document.getElementById('schedule');
    if (!wrap) return;
    const all = entries();
    const upcoming = all.filter(e => statusOf(e) !== 'past');

    if (!upcoming.length) {
      wrap.innerHTML = '<p class="muted">Ingen planlagte sendinger akkurat nå. Følg med – Ambient Mann setter nye tider her.</p>';
    } else {
      wrap.innerHTML = upcoming.map(e => {
        const st = statusOf(e);
        const badge = st === 'live'
          ? '<span class="badge badge-live"><span class="dot"></span>LIVE</span>'
          : '<span class="badge">Kommer</span>';
        const owner = Owner.isOwner()
          ? '<button class="btn btn-tiny owner-only" data-del="' + UI.esc(e.id) + '">Slett</button>'
          : '';
        return '<div class="sched-row">' +
          '<div class="sched-when">' + UI.esc(fmt(e.start)) + ' · ' + (Number(e.hours) || 1) + ' t</div>' +
          '<div class="sched-title">' + UI.esc(e.title || 'Live-sett') + '</div>' +
          badge + owner +
        '</div>';
      }).join('');
    }
    // slett-knapper (eier)
    UI.$all('[data-del]', wrap).forEach(b => b.addEventListener('click', () => remove(b.getAttribute('data-del'))));
    Owner.applyVisibility();
  }

  async function add() {
    const when = document.getElementById('sched-when');
    const hours = document.getElementById('sched-hours');
    const title = document.getElementById('sched-title-in');
    if (!when || !when.value) { UI.toast('Velg dato og tid.'); return; }
    const arr = ((window.Content && Content.get('schedule')) || []).slice();
    arr.push({
      id: 's_' + Date.now().toString(36),
      start: when.value,
      hours: Math.max(1, Math.min(12, parseInt(hours && hours.value, 10) || 2)),
      title: (title && title.value.trim()) || 'Live-sett',
    });
    await Content.set('schedule', arr);
    if (title) title.value = '';
    render();
  }

  async function remove(id) {
    const arr = ((window.Content && Content.get('schedule')) || []).filter(e => e.id !== id);
    await Content.set('schedule', arr);
    render();
  }

  function bind() {
    const btn = document.getElementById('sched-add');
    if (btn) btn.addEventListener('click', add);
  }

  return { render, bind, statusOf, entries };
})();
