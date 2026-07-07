-- =========================================================================
-- Ambient Mann — Supabase-oppsett (kjør i Supabase → SQL editor)
-- To tabeller med RLS lukket, slik at KUN service_role (api/site.js) slipper
-- til. Offentlig lesing styres i api/site.js (ikke via RLS-policy).
-- =========================================================================

-- Innhold eieren kan endre (bio, kreditter, sendeplan, lenker, stream, spor, live-bg)
create table if not exists public.site_content (
  key         text primary key,
  data        jsonb,
  updated_at  timestamptz default now()
);
alter table public.site_content enable row level security;
-- (ingen policy → ingen anon-tilgang; service_role bypasser RLS)

-- Eier-konto: ÉN rad. Passord (scrypt-hash) + reset-token. Aldri offentlig lesbar.
create table if not exists public.owner_account (
  id          int primary key default 1,
  email       text,
  pass_hash   text,
  reset_token text,
  reset_exp   bigint,
  updated_at  timestamptz default now(),
  constraint owner_single_row check (id = 1)
);
alter table public.owner_account enable row level security;

-- Storage-bøtte for opplastet musikk + cover + live-bakgrunn (offentlig lesbar).
insert into storage.buckets (id, name, public)
values ('ambient-mann-media', 'ambient-mann-media', true)
on conflict (id) do nothing;
