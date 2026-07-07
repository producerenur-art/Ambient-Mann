/* =========================================================================
 * AMBIENT MANN — sentral konfigurasjon
 * -------------------------------------------------------------------------
 * ALT som er trygt å ha i nettleseren settes her (offentlige verdier). Siden
 * fungerer selv om ingenting under er fylt ut – da vises «offline / ikke satt
 * opp ennå»-tilstander i stedet for å krasje. Hemmeligheter (Stripe secret,
 * Supabase service_role, OWNER_PASSCODE) settes som miljøvariabler i Vercel,
 * ALDRI her. Se README.md.
 * ========================================================================= */
window.AM_CONFIG = {
  brand: 'Ambient Mann',
  tagline: 'Psybient · Psychill · Cinematic Dark Ambient',
  // Kanonisk domene (kjøpt via domene.no). Brukes til lenker/deling. Selve
  // Stripe-retur-URL settes server-side av SITE_URL i Vercel (se README).
  siteUrl: 'https://www.ambientmann.com',

  /* ---- LIVE STREAM (Icecast / AzuraCast) ------------------------------
   * Ambient Mann sender live via Traktor → Icecast/AzuraCast-server.
   * Lim inn lytte-URL-en her (eller la eieren sette den inne på siden).
   * nowPlayingUrl gir automatisk «LIVE NÅ» + låt/lyttertall. Se
   * docs/AZURACAST-TRAKTOR.md. Tomt = «live er ikke satt opp ennå». */
  streamUrl: '',
  nowPlayingUrl: '',
  nowPlayingInterval: 15000,
  liveDescriptionDefault:
    'Ambient Mann sender live direkte herfra via Traktor (Native Instruments) ' +
    'når han går på lufta. Følg med på sendeplanen under – tidene settes av ' +
    'Ambient Mann selv.',

  /* ---- BOOKING (gratis – kun via e-post) ------------------------------ */
  bookingEmails: ['yaniv@reply.bigfreq.com'],
  bookingSubject: 'Booking — Ambient Mann',
  bookingBody: 'Hei Ambient Mann,\n\nVi ønsker å booke deg. Her er detaljene:\n\nDato/sted:\nType arrangement:\nKontaktperson:\n\nMvh',

  /* ---- DONASJON (frivillig) ------------------------------------------- */
  donation: {
    enabled: true,
    currency: 'nok',
    presets: [100, 200, 500],   // kr
    minKr: 20,
    maxKr: 10000,
  },
  vipps: {
    number: '97253713',
    name: 'Ambient Mann',
    qr: 'assets/vipps-qr.png',  // valgfri QR-bilde
  },

  /* ---- SUPABASE (kun offentlige verdier) ------------------------------
   * service_role-nøkkelen ligger BARE i Vercel-env, aldri her. */
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_BUCKET: 'ambient-mann-media',

  /* ---- CHAT (Gun.js, desentralisert – ingen server) ------------------- */
  gunPeers: ['https://relay.peer.ooo/gun', 'https://gun.defucc.me/gun'],

  /* ---- LENKER (logoer nederst + podcast/web-radio) -------------------- */
  links: {
    // Portrettbildet (silhuetten) → Ambient Manns bibliotek
    radioQ37Artist: 'https://radioq37.com/artist/ambient-mann/',
    // FeedFreq-logo → gruppa
    feedfreq: 'https://app.bigfreq.com/communities/groups/feedfreq-public/home',
    // «The New Message From God»-kunst → offisielt nettsted
    newMessageFromGod: 'https://www.newmessage.org/',
    // psybient.org-logo → nettstedet
    psybient: 'https://www.psybient.org/',
    // Dice Radio (der han startet) → nettstedet
    diceRadio: 'https://diceradio.gr/',
    // Trancentral → nettstedet
    trancentral: 'https://trancentral.tv/',
    // IT Athens (Wake the Beat) → RA-klubbside
    itAthens: 'https://ra.co/clubs/212119',
    // The New Message From God (offisiell logo) → nettstedet
    newMessageOrg: 'https://www.newmessage.org/',
    // Sirius FM (nettradio) → nettstedet
    siriusfm: 'https://www.siriusfm.no',
  },
  // Podcast / web-radio-lenker som vises som spillbare kort. Eieren kan
  // legge til/fjerne flere inne på siden når han er logget inn.
  podcastLinks: [],

  // Kreditter/scene (label & community). MERK: den ene bevisst utelatte
  // label-en skal aldri stå her (holdes ute — se innholdsfilteret i content.js).
  labelCredits: [
    'Cosmicleaf Records',
  ],

  /* ---- BIO (verbatim) -------------------------------------------------- */
  bioDefault:
    'Born in 1982 from Lwood Norway.. With its magical sound of the best ' +
    'ambient, chill out and clarity psybient can offer, Spiced up with a ' +
    'customized twist, he seduces the audience with excitement and narrative ' +
    'at the same time.. Minimal, Ambient, Deep, Psybient, Psychill, Downtempo, ' +
    'Chill Out, Cinematic Dark Ambient & (Ritual-Spiritual) Experimental.',
  bioCreditsDefault:
    'Born in 1982 from Greenland.. With its magical sound of the best ambient, ' +
    'chill out and clarity psybient can offer, Spiced up with a customized twist, ' +
    'he seduces the audience with excitement.',

  /* ---- BILDE-STIER (last opp filene til assets/ – se assets/README.md) - */
  assets: {
    universeBg: 'assets/universe-bg.jpg',              // bakgrunn (stjerner beveger seg oppå)
    logo: 'assets/ambient-mann-logo.png',              // hovedlogo (mindre, i hero)
    portrait: 'assets/ambient-mann-portrait.jpg',      // ditt bilde → radioq37 artist
    feedfreqLogo: 'assets/feedfreq-logo.png',          // → feedfreq-gruppa
    newMessageLogo: 'assets/new-message-from-god.jpg', // The New Message From God
    psybientLogo: 'assets/psybient-logo.png',          // psybient.org
    diceRadioLogo: 'assets/diceradio-logo.png',        // diceradio.gr
    trancentralLogo: 'assets/trancentral-logo.png',    // trancentral.tv
    itAthensLogo: 'assets/it-athens-logo.png',         // ra.co/clubs/212119
    newMessageOrgLogo: 'assets/newmessage-logo.png',   // newmessage.org (diamant)
    siriusfmLogo: 'assets/siriusfm-logo.png',          // siriusfm.no
    bookingImg: 'assets/booking.png',                  // valgfritt booking-bilde
    vippsQr: 'assets/vipps-qr.png',                    // valgfri Vipps-QR
  },
};
