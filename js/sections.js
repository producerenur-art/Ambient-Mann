/* sections.js — Eier kan flytte innholdsseksjoner opp/ned på siden.
 *
 * Rekkefølgen lagres via Content.set('sectionOrder', [...]) (Supabase, eier-token)
 * og gjelder derfor for ALLE besøkende — eieren kurerer det offentlige oppsettet.
 * Hero-banneret ligger alltid øverst; kun de sammenhengende innholdsblokkene under
 * kan omorganiseres. Foreløpig har bare Musikk-seksjonen flytteknapper (▲/▼), men
 * apply() håndterer en vilkårlig rekkefølge av alle blokkene i ORDERABLE. */
window.Sections = (function () {
  'use strict';

  // De sammenhengende innholdsblokkene rett under hero (i standard rekkefølge).
  // Disse er søsken i <main class="wrap">; #live/#gjest-live/logo-strip/#donasjon
  // holdes utenfor så de ikke flyttes utilsiktet.
  const ORDERABLE = ['bio', 'listen', 'links', 'plateselskaper'];

  function wrap() { return document.querySelector('main.wrap'); }

  // Nåværende rekkefølge av de flyttbare blokkene, slik de faktisk ligger i DOM.
  function currentOrder() {
    const w = wrap(); if (!w) return ORDERABLE.slice();
    return Array.prototype.slice.call(w.children)
      .map(function (c) { return c.id; })
      .filter(function (id) { return ORDERABLE.indexOf(id) !== -1; });
  }

  // Plasser blokkene i ønsket rekkefølge, forankret der den første flyttbare
  // blokka ligger nå (rett etter hero). Rører ikke hero/logo-strip/donasjon.
  function apply(order) {
    const w = wrap(); if (!w) return;
    const els = order.map(function (id) { return document.getElementById(id); })
                     .filter(Boolean);
    if (els.length < 2) return;
    const firstOrderable = Array.prototype.slice.call(w.children)
      .filter(function (c) { return ORDERABLE.indexOf(c.id) !== -1; })[0];
    if (firstOrderable) w.insertBefore(els[0], firstOrderable);
    for (var k = 1; k < els.length; k++) els[k - 1].after(els[k]);
  }

  // Flytt seksjonen «id» ett hakk opp (dir=-1) eller ned (dir=+1), lagre for alle.
  function move(id, dir) {
    const order = currentOrder();
    const i = order.indexOf(id);
    if (i < 0) return;
    const j = dir < 0 ? i - 1 : i + 1;
    if (j < 0 || j >= order.length) return;
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    apply(order);
    updateButtons();
    Content.set('sectionOrder', order);
  }

  // Deaktiver ▲ når seksjonen er øverst, ▼ når den er nederst.
  function updateButtons() {
    const order = currentOrder();
    const i = order.indexOf('listen');
    const up = document.querySelector('#listen [data-sec-up]');
    const down = document.querySelector('#listen [data-sec-down]');
    if (up) up.disabled = i <= 0;
    if (down) down.disabled = i < 0 || i >= order.length - 1;
  }

  // Legg ▲/▼-knapper i Musikk-seksjonens overskrift (kun eier ser dem).
  function injectControls() {
    const listen = document.getElementById('listen');
    if (!listen || listen.querySelector('.section-move')) return;
    const head = listen.querySelector('.section-head');
    if (!head) return;
    const box = document.createElement('span');
    box.className = 'section-move owner-only';
    box.style.display = 'none';
    box.style.marginLeft = 'auto';
    box.style.gap = '6px';
    box.innerHTML =
      '<button type="button" class="btn btn-tiny" data-sec-up title="Flytt Musikk-seksjonen opp" aria-label="Flytt opp">▲ Opp</button>' +
      '<button type="button" class="btn btn-tiny" data-sec-down title="Flytt Musikk-seksjonen ned" aria-label="Flytt ned">▼ Ned</button>';
    head.appendChild(box);
    box.querySelector('[data-sec-up]').addEventListener('click', function () { move('listen', -1); });
    box.querySelector('[data-sec-down]').addEventListener('click', function () { move('listen', 1); });
  }

  // Kjøres ved oppstart: bruk lagret rekkefølge, sett inn eier-knapper.
  function render() {
    const saved = Content.get('sectionOrder');
    if (Array.isArray(saved) && saved.length) {
      // Kun kjente IDer; manglende blokker legges til bakerst i standardrekkefølge.
      const valid = saved.filter(function (id) { return ORDERABLE.indexOf(id) !== -1; });
      ORDERABLE.forEach(function (id) { if (valid.indexOf(id) === -1) valid.push(id); });
      apply(valid);
    }
    injectControls();
    updateButtons();
  }

  return { render, apply, move, updateButtons };
})();
