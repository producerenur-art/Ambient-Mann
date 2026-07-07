# Live direkte fra Traktor → nettsiden

Denne siden **spiller** en live-strøm når Ambient Mann kringkaster fra Traktor.
Selve lyden går ikke gjennom nettleseren – den går via en **Icecast/AzuraCast-
server**. Siden spiller strøm-URL-en og viser «LIVE» automatisk.

## Kort oversikt
```
Traktor (Native Instruments)  →  Icecast / AzuraCast-server  →  ambientmann.com (spiller strømmen)
        (Broadcasting)                (mountpoint + now-playing)        (Live-boks + «LIVE»)
```

## 1) Sett opp en server (én gang)
Enklest er **AzuraCast** (gratis, åpen kildekode):
- Installer AzuraCast på en VPS (DigitalOcean/Hetzner o.l.), eller bruk en
  hostet Icecast-leverandør.
- Opprett en stasjon, og noter:
  - **Lytte-URL** (mount), f.eks. `https://din-server.no/listen/ambientmann/radio.mp3`
  - **Now-playing-URL** (valgfri, men gir «LIVE» + lyttertall), f.eks.
    `https://din-server.no/api/nowplaying/1`
- I AzuraCast: aktiver «Streamer/DJ»-konto og noter passord + mount for live.

## 2) Traktor → Broadcasting
I Traktor: **Preferences → Broadcasting**:
- **Server**: adressen til Icecast/AzuraCast
- **Port**: (typisk 8000 / oppgitt av serveren)
- **Mount**: mount-punktet for live (fra AzuraCast)
- **Passord**: streamer-passordet
- **Format**: MP3, 128–320 kbps
Trykk deretter på **kringkast-knappen** i Traktor for å gå live.

## 3) Legg inn URL-ene på siden
Logg inn som eier (knappen «Eier-innlogging», kun Ambient Mann) → seksjonen
**Live** → «Live-strøm fra Traktor»:
- Lim inn **Stream-URL** (lytte-mount).
- Lim inn **Now-playing-URL** (valgfri).
- (Valgfritt) sett **bakgrunn ved live** – et bilde eller en mp4-video som kjører
  bak siden mens du er live.
- Lagre.

Når Traktor kringkaster, viser siden «LIVE NÅ», og publikum trykker ▶ i
spiller-baren for å høre deg direkte.

> Uten server: siden fungerer som normalt, men Live-boksen står i «OFFLINE» til
> en gyldig strøm-URL er satt og Traktor kringkaster.
