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
    if (!list.length) { wrap.innerHTML = '<p class="muted">No links added yet.</p>'; }
    else {
      wrap.innerHTML = list.map((it, i) => {
        const name = it.name || it.url;
        const isOwner = Owner.isOwner();
        // Eier bestemmer rekkefølgen på lenkene selv (▲/▼). Rekkefølgen lagres i
        // 'links' og gjelder for alle besøkende. Knappene er av øverst/nederst.
        const move = isOwner
          ? '<span class="track-moves owner-only">' +
              '<button class="track-move" data-mvuplink="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button>' +
              '<button class="track-move" data-mvdnlink="' + i + '" title="Move down"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button>' +
            '</span>' : '';
        const edit = isOwner
          ? '<button class="btn btn-tiny owner-only" data-editlink="' + i + '">Edit</button>' : '';
        const del = isOwner
          ? '<button class="btn btn-tiny owner-only" data-rmlink="' + i + '">Remove</button>' : '';
        return '<div class="link-item">' +
          '<div class="link-main">' +
            '<a class="link-name" href="' + UI.esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
              UI.brandSafe(UI.esc(name)) + ' ↗</a>' +
            LinkPreview.cardHtml(it.url, 'lk' + i) +
          '</div>' +
          (isOwner ? '<span class="link-actions owner-only">' + move + edit + del + '</span>' : '') +
        '</div>';
      }).join('');
      LinkPreview.hydrate(wrap);
    }
    UI.$all('[data-rmlink]', wrap).forEach(b =>
      b.addEventListener('click', () => remove(parseInt(b.getAttribute('data-rmlink'), 10))));
    UI.$all('[data-editlink]', wrap).forEach(b =>
      b.addEventListener('click', () => edit(parseInt(b.getAttribute('data-editlink'), 10))));
    UI.$all('[data-mvuplink]', wrap).forEach(b =>
      b.addEventListener('click', () => move(parseInt(b.getAttribute('data-mvuplink'), 10), 'up')));
    UI.$all('[data-mvdnlink]', wrap).forEach(b =>
      b.addEventListener('click', () => move(parseInt(b.getAttribute('data-mvdnlink'), 10), 'down')));
    Owner.applyVisibility();
  }

  async function add() {
    const nameEl = document.getElementById('link-name');
    const urlEl = document.getElementById('link-url');
    const url = urlEl && urlEl.value.trim();
    const name = (nameEl && nameEl.value.trim()) || '';
    if (!/^https?:\/\//i.test(url || '')) { UI.toast('Paste a valid link (https://…).'); return; }
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

  // ---- eier: bestem rekkefølgen (flytt hver lenke opp/ned) ----------------
  // Lenkene vises i samme rekkefølge som de ligger i 'links', så et bytte med
  // naboen i lista er alt som skal til. Ny rekkefølge gjelder for alle besøkende.
  async function move(i, dir) {
    if (!Owner.isOwner()) return;
    const arr = items();
    const j = dir === 'up' ? i - 1 : i + 1;
    if (!arr[i] || j < 0 || j >= arr.length) return;     // allerede øverst/nederst
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    await Content.set('links', arr);
    render();
  }

  // ---- eier: rediger en lenke (navn + URL) --------------------------------
  // Navnet er teksten publikum klikker på; URL-en styrer både hvor lenka går og
  // hvilket forhåndsvisnings-kort som hentes (LinkPreview).
  function edit(i) {
    const it = items()[i]; if (!it) return;
    const back = document.createElement('div');
    back.className = 'share-back';
    const menu = document.createElement('div');
    menu.className = 'share-menu';
    menu.style.cssText = 'text-align:left; max-height:85vh; overflow-y:auto';

    const head = document.createElement('div');
    head.className = 'share-title';
    head.textContent = 'Edit link';
    menu.appendChild(head);

    function label(txt) {
      const l = document.createElement('label');
      l.className = 'muted';
      l.style.cssText = 'font-size:12px; display:block; margin:6px 0 5px';
      l.textContent = txt;
      return l;
    }

    menu.appendChild(label('Name (shown as a clickable link)'));
    const nameEl = document.createElement('input');
    nameEl.className = 'input'; nameEl.type = 'text';
    nameEl.value = it.name || ''; nameEl.setAttribute('aria-label', 'Name');
    menu.appendChild(nameEl);

    menu.appendChild(label('URL'));
    const urlEl = document.createElement('input');
    urlEl.className = 'input'; urlEl.type = 'url';
    urlEl.value = it.url || ''; urlEl.setAttribute('aria-label', 'URL');
    menu.appendChild(urlEl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:12px';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary'; saveBtn.style.flex = '1'; saveBtn.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.className = 'btn'; cancel.style.flex = '1'; cancel.textContent = 'Cancel';
    row.appendChild(saveBtn); row.appendChild(cancel);
    menu.appendChild(row);

    function close() { if (saveBtn.disabled) return; back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape') close(); }

    async function doSave() {
      if (saveBtn.disabled) return;
      const url = urlEl.value.trim();
      if (!/^https?:\/\//i.test(url)) { UI.toast('Paste a valid link (https://…).'); urlEl.focus(); return; }
      saveBtn.disabled = true; cancel.disabled = true;
      try {
        const arr = items();
        if (!arr[i]) { close(); return; }
        arr[i] = { name: nameEl.value.trim(), url: url };
        await Content.set('links', arr);
        saveBtn.disabled = false; cancel.disabled = false;
        render(); close();
        UI.toast('The link has been updated.');
      } catch (e) {
        saveBtn.disabled = false; cancel.disabled = false;
        UI.toast('Could not save: ' + ((e && e.message) || e));
      }
    }
    saveBtn.addEventListener('click', doSave);
    cancel.addEventListener('click', close);
    nameEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doSave(); });
    urlEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doSave(); });
    back.addEventListener('click', (ev) => { if (ev.target === back) close(); });
    document.addEventListener('keydown', onKey);
    back.appendChild(menu);
    document.body.appendChild(back);
    nameEl.focus(); nameEl.select();
  }

  function bind() {
    const btn = document.getElementById('link-add');
    if (btn) btn.addEventListener('click', add);
  }

  return { render, bind };
})();
