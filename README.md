# Ambient Mann — booking-side

Frittstående, byggefri nettside (vanilla JS) for booking av **Ambient Mann**
(psybient / psychill / cinematic dark ambient). Deployes på Vercel.

**Domene:** www.ambientmann.com

## Hva siden har
- **Booking** (gratis, kun via e-post): `yaniv@bigfreq.com`.
- **Bio** (over booking-e-posten) + scene/label-kreditter.
- **Musikk** publikum velger selv: opplastet WAV/MP3 (1–2 t) med eget cover + spiller med **spoling**.
- **Live direkte fra Traktor** (Icecast/AzuraCast) med «LIVE»-deteksjon + valgfri **live-bakgrunn** (bilde/mp4).
- **Sendeplan** Ambient Mann setter selv.
- **Donasjon** (frivillig): Stripe (kort) + **Vipps 97253713**.
- **Lenker** (navn → URL, som SoundCloud) som spillbare kort.
- **Flyttbar chat** med kallenavn.
- **Eier-innlogging kun for Ambient Mann**: eget passord + «Glemt passord?» (e-post-reset).
- **Gjest Show Live Stream**: inviterte gjester kan registrere seg (navn + e-post + passord),
  bekrefte e-posten, og — etter at Ambient Mann **godkjenner** kontoen — sette egne sendetider,
  laste opp egen musikk (WAV/MP3 + cover) og legge inn egen live-strøm. Samme flyt som admin,
  men egen konto. Publikum ser gjestenes sendeplan, live-strømmer og spor. Toppmenyen har en
  **«Gjest»**-lenke, og den innloggede gjestens selvvalgte navn vises der.

Booking er det eneste som «koster» (avtales via e-post). Alt annet er gratis.

### Gjest-flyt (kort)
1. Gjest trykker **«Logg inn som gjest» → «Ny gjest? Registrer deg»** og oppretter konto.
2. Gjesten bekrefter e-posten via lenken (`?gconfirm=…`).
3. Ambient Mann (innlogget som eier) ser gjesten under **«Gjester — godkjenn / avvis»** og trykker **Godkjenn**.
4. Gjesten får e-post om godkjenning og kan nå sette sendetid / laste opp musikk / legge inn live-strøm.
5. **«Glemt passord?»** fungerer for gjester (`?greset=…`), akkurat som for eier.

## Kjør lokalt
```bash
cd ambient-mann
python3 -m http.server 8000       # åpne http://localhost:8000
```
`/api/*` er Vercel-funksjoner og gir 404 under `http.server` — siden er laget for
å degradere pent (lokal/fallback-modus). For å teste API-et lokalt: `vercel dev`.

## Legg inn bilder
Se [assets/README.md](assets/README.md) — legg logoene/bildene i `assets/` med de
oppgitte filnavnene. Alt av stier og lenker styres i [js/config.js](js/config.js).

## Deploy (Vercel)
1. `vercel` (link til nytt prosjekt «ambient-mann») → `vercel --prod`.
2. Pek domenet **www.ambientmann.com** (fra domene.no) mot Vercel:
   - I Vercel → prosjekt → Settings → Domains → legg til `www.ambientmann.com`.
   - Hos **domene.no**: sett en **CNAME** for `www` → `cname.vercel-dns.com`
     (og evt. A/ALIAS for apex `ambientmann.com` slik Vercel viser).

## Miljøvariabler (Vercel → Settings → Environment Variables)
Alt er valgfritt — siden kjører i fallback-modus uten dem.

| Variabel | Trengs for |
|----------|-----------|
| `AM_TOKEN_SECRET` | Eier-token (sett en lang tilfeldig streng) — kreves for innlogging |
| `OWNER_PASSCODE` | Bootstrap-passord (til Ambient Mann oppretter eget passord i DB) |
| `OWNER_EMAIL` | Ambient Manns e-post (for «Glemt passord?») |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Opplasting + lagring av innhold/spor |
| `SUPABASE_BUCKET` | (valgfri) standard `ambient-mann-media` |
| `STRIPE_SECRET_KEY` | Kort-donasjon (Vipps virker uten) |
| `SITE_URL` | `https://www.ambientmann.com` (Stripe-retur + reset-lenker) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Sende «Glemt passord?»- og **gjest-bekreftelses**-e-post |

Offentlige verdier (`SUPABASE_URL`/anon-key, Vipps-nr., lenker) settes i
[js/config.js](js/config.js). Hemmeligheter settes KUN i Vercel-env.

### ⚠️ MÅ GJØRES: aktiver e-post (Resend)
`RESEND_API_KEY` er **ikke satt i produksjon ennå**. Uten den:
- **«Glemt passord?»** virker ikke — verken for Ambient Mann (eier) eller for gjester.
- Gjester får **ingen** bekreftelses-/godkjennings-e-post (de auto-bekreftes i stedet, men må
  fortsatt godkjennes manuelt av Ambient Mann før de kan hoste).

Slik aktiverer du det:
1. Lag konto på [resend.com](https://resend.com), verifiser avsender-domenet (`ambientmann.com`)
   og hent en API-nøkkel.
2. Sett variablene i Vercel og re-deploy:
   ```bash
   vercel env add RESEND_API_KEY production
   vercel env add RESEND_FROM_EMAIL production   # f.eks. "Ambient Mann <noreply@ambientmann.com>"
   vercel --prod
   ```
3. Sjekk at det slo til: `curl -s https://www.ambientmann.com/api/site?action=guest-status`
   skal nå gi `"resetSupported":true` og `"confirmSupported":true`.

> **Uten domene-verifisering** kan du teste med Resends standardavsender
> `onboarding@resend.dev` (settes automatisk hvis `RESEND_FROM_EMAIL` mangler), men e-post til
> vilkårlige mottakere krever verifisert domene i produksjon.

## Supabase
Kjør [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) i
Supabase → SQL editor (lager tabeller + storage-bøtte), og deretter
[supabase/migrations/0002_guest.sql](supabase/migrations/0002_guest.sql) (lager
`guest_account`-tabellen for Gjest Show Live Stream). Lim `SUPABASE_URL` +
`SUPABASE_ANON_KEY` inn i `js/config.js`, og `SUPABASE_SERVICE_ROLE_KEY` i Vercel.

## Live fra Traktor
Se [docs/AZURACAST-TRAKTOR.md](docs/AZURACAST-TRAKTOR.md).
