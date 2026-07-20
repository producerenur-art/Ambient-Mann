-- =========================================================================
-- Ambient Mann — avspillingsteller (kjør i Supabase → SQL editor etter 0002)
-- Teller hvor mange ganger hvert spor spilles av (både i spilleren på forsiden
-- og på de delbare /podcast/<navn>-sidene). KUN eier ser tallene (via
-- api/site.js ?action=plays, bak eier-token). Tabellen er RLS-lukket:
-- kun service_role slipper til. Ingen personopplysninger lagres — bare en
-- teller per spor-id.
-- =========================================================================

create table if not exists public.track_plays (
  track_id   text primary key,     -- spor-id (samme 't_...' som i site_content.tracks)
  title      text,                 -- siste kjente tittel (kun for pen visning)
  count      bigint not null default 0,
  updated_at timestamptz default now()
);
alter table public.track_plays enable row level security;
-- (ingen policy → ingen anon-tilgang; service_role bypasser RLS)

-- Atomisk +1 (unngår tapte tellinger ved samtidige avspillinger). Kalles fra
-- api/site.js ?action=play. security definer så den kjører uansett RLS.
create or replace function public.increment_play(p_id text, p_title text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  insert into public.track_plays (track_id, title, count, updated_at)
  values (p_id, nullif(p_title, ''), 1, now())
  on conflict (track_id) do update
    set count      = track_plays.count + 1,
        title      = coalesce(nullif(excluded.title, ''), track_plays.title),
        updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;
