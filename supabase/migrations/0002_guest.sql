-- =========================================================================
-- Ambient Mann — gjeste-kontoer (kjør i Supabase → SQL editor etter 0001)
-- FLERE gjester kan registrere seg (e-post + eget passord), bekrefte e-posten,
-- og — etter at Ambient Mann (eier) har godkjent dem — sette sine egne
-- sendetider i «Gjest Show Live Stream». RLS lukket: KUN service_role
-- (api/site.js) slipper til. Aldri offentlig lesbar (inneholder pass-hash).
-- =========================================================================

create table if not exists public.guest_account (
  id            bigserial primary key,
  email         text unique not null,
  name          text,
  pass_hash     text not null,
  confirmed     boolean default false,   -- e-post bekreftet?
  confirm_token text,                     -- sha256 av bekreftelses-token
  approved      boolean default false,   -- godkjent av Ambient Mann?
  reset_token   text,                     -- sha256 av glemt-passord-token
  reset_exp     bigint,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.guest_account enable row level security;
-- (ingen policy → ingen anon-tilgang; service_role bypasser RLS)

-- rask oppslag på e-post (case-insensitivt lagres alltid lowercased i api-laget)
create unique index if not exists guest_account_email_idx on public.guest_account (email);

-- Gjestenes sendeplan lagres i site_content under nøkkelen 'guestSchedule'
-- (samme mønster som eierens 'schedule'), så den leses offentlig via content-get.
