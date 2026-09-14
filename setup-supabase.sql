-- LUCIAN VEX CLOUD SYNC — FULL DATA PRESERVATION SETUP
--
-- Run this entire file in Supabase SQL Editor AFTER creating your owner user.
-- Replace YOUR_OWNER_USER_UUID with the UUID of your owner account.
-- This seed preserves the complete current Lucian Vex data instead of replacing it with a reduced demo dataset.

create table if not exists public.lucian_site_data (
  id smallint primary key default 1 check (id = 1),
  owner_uid uuid not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lucian_site_data enable row level security;

grant select on public.lucian_site_data to anon, authenticated;
grant update on public.lucian_site_data to authenticated;

drop policy if exists "Public can read Lucian Vex site" on public.lucian_site_data;
create policy "Public can read Lucian Vex site"
  on public.lucian_site_data
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Owner can update Lucian Vex site" on public.lucian_site_data;
create policy "Owner can update Lucian Vex site"
  on public.lucian_site_data
  for update
  to authenticated
  using ((select auth.uid()) = owner_uid)
  with check ((select auth.uid()) = owner_uid);

insert into public.lucian_site_data (id, owner_uid, data)
values (
  1,
  '593b71d2-39bd-4a01-80d6-e124b8326a5d'::uuid,
  $json${"profile":{"name":"Lucian Vex","status":"ONLINE","tagline":"BUILD. LEARN. PLAY. REPEAT.","title":"THE DESTROYER","bio":"Self-taught, independent, and obsessed with understanding how things work. I turn ideas into systems, break problems apart, and keep pushing until I find a solution.","location":"","email":"riyanabbasi025@gmail.com","discord":"lucian_vex","contact":{"title":"Contact","text":"Open to conversations, collaborations, games, projects, or just a good conversation."},"theme":{"name":"vex-noir","custom":false,"colors":{"name":"Vex Noir","sub":"Deep black / hot pink / violet","bg":"#08070d","bg2":"#100b18","panel":"#13101b","panel2":"#191322","pink":"#ff2bb5","pink2":"#ff6bd0","purple":"#8b5cf6","purple2":"#b891ff","white":"#f8f6ff","muted":"#aaa2b5","line":"#2d2638"}},"discordProfile":{"displayName":"LUCIAN VEX","username":"@lucian_vex","status":"ONLINE","customStatus":"Building systems & collecting worlds.","about":"Self-taught developer, gamer and anime fan.","avatar":"","banner":"","decoration":"","profileEffect":true,"memberSince":"","badges":["PROFILE EFFECT READY","PERSONAL PROFILE"],"liveWallpaper":{"mode":"cyberflow","videoUrl":"","opacity":0.36,"blur":0}}},"skills":[{"name":"WEB DEVELOPMENT","level":45,"desc":"Frontend • Backend • Fullstack"},{"name":"VIBE CODING","level":100,"desc":"Clean systems • Sharp aesthetics"},{"name":"PROBLEM SOLVING","level":99,"desc":"Analysis • Adaptation"},{"name":"FOCUS / DISCIPLINE","level":80,"desc":"Staying locked in"},{"name":"CREATIVITY","level":99,"desc":"Creating with purpose"},{"name":"GAMING","level":90,"desc":"Competition • Strategy • Adaptation"}],"games":[{"title":"VALORANT","status":"NEW PLAYER","type":"Competitive","poster":"images/games/valorant.jpg","rank":"Updating...","progress":10,"goal":"First ranked milestone"},{"title":"CHESS","status":"ACTIVE","type":"Strategy","poster":"images/games/chess.jpg","rank":"Elite","progress":80,"goal":"Keep improving"},{"title":"NIER: AUTOMATA","status":"PLAYING","type":"Action RPG","poster":"images/games/nier-automata.jpg","rank":"In Progress","progress":35,"goal":"Continue the story"}],"anime":[{"title":"SOLO LEVELING","status":"Favorite","episode":0,"totalEpisodes":25,"score":"","favorite":true,"notes":"","poster":"images/anime/solo-leveling.jpg"}],"links":[{"name":"GITHUB","role":"Code & Projects","icon":"GH","url":"https://github.com/riyanabbasi025-collab"},{"name":"YOUTUBE","role":"Content Creation","icon":"YT","url":"https://www.youtube.com/@RiYanAbbaSi-512"},{"name":"X / TWITTER","role":"Thoughts & Updates","icon":"X","url":"https://x.com/Riya12369"},{"name":"INSTAGRAM","role":"Visuals & Updates","icon":"IG","url":"https://www.instagram.com/lucian.vex/"},{"name":"FACEBOOK","role":"Social","icon":"FB","url":"https://www.facebook.com/profile.php?id=61593794109557"},{"name":"TIKTOK","role":"Short Form","icon":"TT","url":"https://www.tiktok.com/@lucian.vex"}]}$json$::jsonb
)
on conflict (id) do update set
  owner_uid = excluded.owner_uid,
  data = excluded.data,
  updated_at = now();

-- Add the site row to Supabase Realtime once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lucian_site_data'
  ) then
    alter publication supabase_realtime add table public.lucian_site_data;
  end if;
end $$;
