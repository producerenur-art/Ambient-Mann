/* =========================================================================
 * AMBIENT MANN — lenker (podcast / web-radio / SoundCloud o.l.)
 * Ambient Mann legger til NAVN + URL (som på SoundCloud): navnet han velger
 * blir en klikkbar lenke rett til URL-en (åpner ny side). I tillegg vises et
 * spillbart forhåndsvisnings-kort (LinkPreview) under.
 * Lagres som [{ name, url }]. Bakoverkompatibelt med gamle rene URL-strenger.
 * ========================================================================= */
window.Links = (function () {
  function items() {
    const raw = (window.Content && Content.get('links')) || [];
    return raw.map(x => (typeof x === 'string' ? { name: '', url: x } : x)).filter(x => x && x.url);
  }

  function render() {
    const wrap = document.getElementById('links-list');
    if (!wrap) return;
    const list = items();
    if (!list.length) { wrap.innerHTML = '<p class="muted">Ingen lenker lagt til ennå.</p>'; }
    else {
      wrap.innerHTML = list.map((it, i) => {
        const name = it.name || it.url;
        const del = Owner.isOwner()
          ? '<button class="btn btn-tiny owner-only" data-rmlink="' + i + '">Fjern</button>' : '';
        return '<div class="link-item">' +
          '<div class="link-main">' +
            '<a class="link-name" href="' + UI.esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
              UI.esc(name) + ' ↗</a>' +
            LinkPreview.cardHtml(it.url, 'lk' + i) +
          '</div>' + del +
        '</div>';
      }).join('');
      LinkPreview.hydrate(wrap);
    }
    UI.$all('[data-rmlink]', wrap).forEach(b =>
      b.addEventListener('click', () => remove(parseInt(b.getAttribute('data-rmlink'), 10))));
    Owner.applyVisibility();
  }

  async function add() {
    const nameEl = document.getElementById('link-name');
    const urlEl = document.getElementById('link-url');
    const url = urlEl && urlEl.value.trim();
    const name = (nameEl && nameEl.value.trim()) || '';
    if (!/^https?:\/\//i.test(url || '')) { UI.toast('Lim inn en gyldig lenke (https://…).'); return; }
    const arr = items(); arr.push({ name: name, url: url });
    await Content.set('links', arr);
    if (nameEl) nameEl.value = ''; if (urlEl) urlEl.value = '';
    render();
  }

  async function remove(i) {
    const arr = items(); arr.splice(i, 1);
    await Content.set('links', arr);
    render();
  }

  function bind() {
    const btn = document.getElementById('link-add');
    if (btn) btn.addEventListener('click', add);
  }

  return { render, bind };
})();
