-- =========================================================================
-- Ambient Mann — besøkstall (kjør i Supabase → SQL editor etter 0003)
-- Teller sidevisninger og unike besøkende per dag. KUN eier ser tallene
-- (via api/site.js ?action=visits, bak eier-token). Tabellen er RLS-lukket:
-- kun service_role slipper til. Ingen personopplysninger lagres — ingen IP,
-- ingen informasjonskapsler, bare to tall per dato.
-- =========================================================================

create table if not exists public.site_visits (
  day        date primary key,      -- dato (UTC)
  views      bigint not null default 0,   -- alle sidelastinger
  visitors   bigint not null default 0,   -- unike enheter denne dagen
  updated_at timestamptz default now()
);
alter table public.site_visits enable row level security;
-- (ingen policy → ingen anon-tilgang; service_role bypasser RLS)

-- Atomisk +1 (unngår tapte tellinger ved samtidige besøk). Kalles fra
-- api/site.js ?action=visit. p_fresh = true første gang enheten er innom
-- i løpet av dagen. security definer så den kjører uansett RLS.
create or replace function public.increment_visit(p_fresh boolean)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_views bigint;
begin
  insert into public.site_visits (day, views, visitors, updated_at)
  values (current_date, 1, case when p_fresh then 1 else 0 end, now())
  on conflict (day) do update
    set views      = site_visits.views + 1,
        visitors   = site_visits.visitors + case when p_fresh then 1 else 0 end,
        updated_at = now()
  returning views into new_views;
  return new_views;
end;
$$;
