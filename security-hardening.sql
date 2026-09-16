-- LUCIAN VEX SECURITY HARDENING V1
-- Run once in Supabase SQL Editor after V35 is deployed.
-- This preserves public read access to site content while hiding owner_uid
-- from anonymous/authenticated table reads and gives the frontend a narrow
-- owner-check function.

create or replace view public.lucian_site_public as
select id, data, updated_at
from public.lucian_site_data;

grant select on public.lucian_site_public to anon, authenticated;
revoke select on public.lucian_site_data from anon, authenticated;

revoke insert, delete on public.lucian_site_data from anon, authenticated;
grant update on public.lucian_site_data to authenticated;

-- Keep owner writes restricted to the row whose owner_uid matches the signed-in user.
alter table public.lucian_site_data enable row level security;
drop policy if exists lucian_owner_can_update_site_data on public.lucian_site_data;
create policy lucian_owner_can_update_site_data
on public.lucian_site_data
for update
to authenticated
using (owner_uid = (select auth.uid()))
with check (owner_uid = (select auth.uid()));

drop function if exists public.lucian_is_owner();
create function public.lucian_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lucian_site_data
    where id = 1
      and owner_uid = (select auth.uid())
  );
$$;

revoke execute on function public.lucian_is_owner() from public;
revoke execute on function public.lucian_is_owner() from anon;
grant execute on function public.lucian_is_owner() to authenticated;
