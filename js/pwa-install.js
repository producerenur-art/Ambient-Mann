/* =========================================================================
 * AMBIENT MANN — «Få appen på enheten din»
 * Installerer siden som app (PWA) på Android, Apple og Mac/PC. På Chromium
 * (Android + desktop) brukes den native install-dialogen via beforeinstallprompt.
 * På iOS/Safari finnes ingen slik dialog → vi viser «Del → Legg til på
 * Hjem-skjerm»-instruksjoner i stedet. App Store-valget er «Coming soon».
 * ========================================================================= */
window.PWAInstall = (function () {
  let deferred = null;   // lagret beforeinstallprompt-event

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;   // iOS
  }
  function say(m) { if (window.UI && UI.toast) UI.toast(m); else alert(m); }

  async function trigger(kind) {
    if (isStandalone()) { say('Appen er allerede installert – åpne den fra Hjem-skjermen.'); return; }

    // Native install-dialog (Android Chrome, Edge, desktop Chrome …)
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) {}
      deferred = null;   // kan kun brukes én gang
      return;
    }

    // Ingen native dialog → plattform-tilpassede instruksjoner
    if (isIOS()) {
      say('iPhone/iPad: trykk Del-knappen ⬆️ i Safari, og velg «Legg til på Hjem-skjerm».');
    } else if (kind === 'desktop') {
      say('Mac/PC: klikk installasjons­ikonet ⤓ i adressefeltet, eller nettlesermenyen ⋮ → «Installer app».');
    } else {
      say('Android: åpne menyen ⋮ i nettleseren og velg «Installer app» / «Legg til på startskjerm».');
    }
  }

  function init() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
    window.addEventListener('appinstalled', () => { deferred = null; say('Takk! Ambient Mann er installert. 🎉'); });

    const phone = document.getElementById('install-phone');
    const desktop = document.getElementById('install-desktop');
    if (phone) phone.addEventListener('click', () => trigger('phone'));
    if (desktop) desktop.addEventListener('click', () => trigger('desktop'));

    // Allerede installert → vis status i stedet for «Installer»-knappene
    if (isStandalone()) {
      [phone, desktop].forEach((b) => {
        if (!b) return;
        const cta = b.querySelector('.res-cta');
        if (cta) { cta.textContent = 'Installert ✓'; cta.style.background = 'rgba(127,227,176,.22)'; cta.style.color = 'var(--accent2)'; }
        b.classList.remove('res-opt-live'); b.setAttribute('disabled', '');
      });
    }
  }

  return { init };
})();
