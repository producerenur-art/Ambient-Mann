/* =========================================================================
 * AMBIENT MANN — plateselskaper (navn → URL, klikkbare lenker)
 * Bare navnene vises som lenker (ingen forhåndsvisnings-kort). Lagres under
 * innholdsnøkkelen 'labels' som [{ name, url }]. Eieren kan legge til/fjerne
 * når han er logget inn. SAMME liste vises på hver spor-side (/track/...),
 * så nye plateselskaper dukker opp overalt automatisk.
 * ========================================================================= */
window.Labels = (function () {
  function items() {
    const raw = (window.Content && Content.get('labels')) || [];
    return raw.map(x => (typeof x === 'string' ? { name: '', url: x } : x)).filter(x => x && x.url);
  }

  function render() {
    const wrap = document.getElementById('labels-list');
    if (!wrap) return;
    const list = items();
    if (!list.length) { wrap.innerHTML = '<p class="muted">Ingen plateselskaper lagt til ennå.</p>'; }
    else {
      wrap.innerHTML = list.map((it, i) => {
        const name = it.name || it.url;
        const del = Owner.isOwner()
          ? '<button class="btn btn-tiny owner-only" data-rmlabel="' + i + '">Fjern</button>' : '';
        return '<div class="link-item">' +
          '<div class="link-main">' +
            '<a class="link-name" href="' + UI.esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
              UI.brandSafe(UI.esc(name)) + ' ↗</a>' +
          '</div>' + del +
        '</div>';
      }).join('');
    }
    UI.$all('[data-rmlabel]', wrap).forEach(b =>
      b.addEventListener('click', () => remove(parseInt(b.getAttribute('data-rmlabel'), 10))));
    Owner.applyVisibility();
  }

  async function add() {
    const nameEl = document.getElementById('label-name');
    const urlEl = document.getElementById('label-url');
    const url = urlEl && urlEl.value.trim();
    const name = (nameEl && nameEl.value.trim()) || '';
    if (!/^https?:\/\//i.test(url || '')) { UI.toast('Lim inn en gyldig lenke (https://…).'); return; }
    const arr = items(); arr.push({ name: name, url: url });
    await Content.set('labels', arr);
    if (nameEl) nameEl.value = ''; if (urlEl) urlEl.value = '';
    render();
  }

  async function remove(i) {
    const arr = items(); arr.splice(i, 1);
    await Content.set('labels', arr);
    render();
  }

  function bind() {
    const btn = document.getElementById('label-add');
    if (btn) btn.addEventListener('click', add);
  }

  return { render, bind };
})();
