(() => {
  'use strict';

  // Lucian Vex Recovery Layer v28
  // This layer is deliberately independent from the main app. It only takes
  // over when the normal renderer has failed to populate a page.
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v, a=0, b=100) => Math.min(b, Math.max(a, Number(v) || 0));
  const source = window.LUCIAN_DATA && typeof window.LUCIAN_DATA === 'object' ? window.LUCIAN_DATA : {};

  function arrays() {
    return {
      games: Array.isArray(source.games) ? source.games : [],
      anime: Array.isArray(source.anime) ? source.anime : [],
      skills: Array.isArray(source.skills) ? source.skills : [],
      links: Array.isArray(source.links) ? source.links : []
    };
  }

  const builtins = {
    favorite:'MY FAVORITES', rotation:'IN ROTATION', want:'WANT TO PLAY',
    completed:'COMPLETED', watching:'WATCHING', planning:'PLANNING',
    paused:'PAUSED', dropped:'DROPPED'
  };
  const alias = {
    favourite:'favorite',favorites:'favorite',favourites:'favorite','my favorites':'favorite',
    'in rotation':'rotation',rotation:'rotation','games in rotation':'rotation',
    want:'want','want to play':'want',wishlist:'want',backlog:'want','games i want to play':'want',planned:'want',
    completed:'completed',complete:'completed',finished:'completed',done:'completed',
    watching:'watching','currently watching':'watching',planning:'planning','plan to watch':'planning',
    paused:'paused',pause:'paused',dropped:'dropped',drop:'dropped'
  };
  const slug = v => String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  function cats(item, kind) {
    const raw=[];
    if (Array.isArray(item.categories)) raw.push(...item.categories);
    if (item.category != null) raw.push(item.category);
    if (kind==='anime' && item.status != null) raw.push(item.status);
    if (item.favorite) raw.push('favorite');
    const out=[];
    const custom = Array.isArray(source.categories) ? source.categories : [];
    const names = new Map(Object.entries(builtins));
    custom.forEach(c => { const id=slug(c?.id||c?.slug||c?.name||c?.label); if(id) names.set(id, String(c?.label||c?.name||id).toUpperCase()); });
    raw.forEach(v => {
      const key = typeof v==='object' ? String(v.id||v.slug||v.name||v.label||'') : String(v);
      const id = alias[key.toLowerCase().trim()] || slug(key);
      if (id && names.has(id) && !out.includes(id)) out.push(id);
    });
    if (!out.length) out.push(kind==='game'?'rotation':'planning');
    return out;
  }
  function labels() {
    const m = new Map(Object.entries(builtins));
    (Array.isArray(source.categories)?source.categories:[]).forEach(c => {
      const id=slug(c?.id||c?.slug||c?.name||c?.label); if(id) m.set(id,String(c?.label||c?.name||id).toUpperCase());
    });
    return m;
  }

  function renderSkills() {
    const grid=$('#skills-grid'); if(!grid) return;
    const d=arrays();
    if(grid.children.length && !grid.querySelector('.empty')) return;
    grid.innerHTML=d.skills.length ? d.skills.map(s=>`<article class="card skill-card"><div class="skill-top"><span class="skill-name">${esc(s.name||'UNTITLED')}</span><span class="level">${clamp(s.level)}%</span></div><div class="bar"><span style="width:${clamp(s.level)}%"></span></div><p class="card-desc">${esc(s.desc||'')}</p></article>`).join('') : '<div class="empty">No skills yet.</div>';
  }

  function renderArchive(kind) {
    const grid=$(kind==='game'?'#game-grid':'#anime-grid'); if(!grid) return;
    const d=arrays(), items=kind==='game'?d.games:d.anime, labelsMap=labels();
    if(!grid.children.length || grid.querySelector('.empty')) draw('all');
    const toolbar=$(kind==='game'?'.game-toolbar':'.anime-toolbar');
    if(toolbar && !toolbar.dataset.recoveryBound){
      const used=[...new Set(items.flatMap(x=>cats(x,kind)))];
      toolbar.innerHTML='<button class="filter active" data-recovery-filter="all" type="button">'+(kind==='game'?'ALL GAMES':'ALL ANIME')+'</button>'+used.map(id=>`<button class="filter" data-recovery-filter="${esc(id)}" type="button">${esc(labelsMap.get(id)||id.toUpperCase())}</button>`).join('');
      toolbar.dataset.recoveryBound='1';
      toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-recovery-filter]');if(!b)return;$$('[data-recovery-filter]',toolbar).forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.recoveryFilter||'all');});
    }
    function draw(filter){
      const visible=items.filter(x=>filter==='all'||cats(x,kind).includes(filter));
      if(!visible.length){grid.innerHTML='<div class="empty">Nothing matches this view.</div>';return;}
      grid.innerHTML=visible.map((x,i)=>{
        const tags=cats(x,kind).map(id=>`<span class="tag">${esc(labelsMap.get(id)||id)}</span>`).join('');
        if(kind==='game') return `<article class="card archive-card"><div class="poster-frame"><img class="poster" loading="lazy" src="${esc(x.poster||'')}" alt="${esc(x.title||'')} poster"><span class="source-badge">${esc(x.source==='steam'?'STEAM':'MANUAL')}</span></div><div class="card-body"><div class="category-tags">${tags}</div><h3>${esc(x.title||'Untitled')}</h3><div class="game-meta"><span>${esc(x.rank||'No rank')}</span><span>${clamp(x.progress)}%</span></div><div class="progress-line"><span style="width:${clamp(x.progress)}%"></span></div></div></article>`;
        const pct=x.totalEpisodes?clamp(Math.round((Number(x.episode||0)/Number(x.totalEpisodes))*100)):0;
        return `<article class="card anime-card archive-card"><div class="poster-frame anime"><img class="poster" loading="lazy" src="${esc(x.poster||'')}" alt="${esc(x.title||'')} poster"><span class="source-badge">${x.anilistId?'ANILIST':'MANUAL'}</span></div><div class="card-body"><div class="category-tags">${tags}</div><h3>${esc(x.title||'Untitled')}</h3><div class="anime-meta"><span>EP ${Number(x.episode)||0}/${Number(x.totalEpisodes)||'?'}</span><span>${esc(x.score||'NO SCORE')}</span></div><div class="progress-line"><span style="width:${pct}%"></span></div></div></article>`;
      }).join('');
    }
  }

  function renderLinks(){
    const grid=$('#links-grid'); if(!grid) return;
    const d=arrays(); if(grid.children.length) return;
    grid.innerHTML=d.links.length?d.links.map(x=>`<a class="card link-card link-card-main" href="${esc(String(x.url||'#'))}" target="_blank" rel="noopener noreferrer"><div class="link-icon">${esc(x.icon||'↗')}</div><div style="flex:1"><strong>${esc(x.name||'LINK')}</strong><p>${esc(x.role||'')}</p></div><span class="link-open-arrow">↗</span></a>`).join(''):'<div class="empty">No connections yet.</div>';
  }

  function renderProfile(){
    const p=source.profile||{};
    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
    set('#profile-name',p.name||'Lucian Vex'); set('#profile-bio',p.bio||''); set('#discord',p.discord||''); set('#email',p.email||'');
    set('#stat-skills',(arrays().skills.length)); set('#stat-games',(arrays().games.length)); set('#stat-anime',(arrays().anime.length));
  }

  function applySimpleWallpaper(){
    const layer=$('#live-wallpaper-layer'); if(!layer)return;
    const w=source.profile?.liveWallpaper||source.profile?.discordProfile?.liveWallpaper; if(!w)return;
    layer.dataset.mode=String(w.mode||'cyberflow');
    layer.style.setProperty('--wallpaper-opacity',String(Number(w.opacity ?? .32)));
    layer.style.setProperty('--wallpaper-blur',`${Number(w.blur ?? 0)}px`);
    layer.classList.toggle('disabled',w.mode==='none');
    const video=$('#live-wallpaper-video'); const url=String(w.videoUrl||'').trim();
    if(video && w.mode==='video' && url){video.src=url;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.style.display='block';video.play?.().catch(()=>{});} 
  }

  function recover(){
    renderProfile(); renderSkills(); renderArchive('game'); renderArchive('anime'); renderLinks(); applySimpleWallpaper();
    $$('.reveal').forEach(e=>e.classList.add('is-visible'));
  }

  function shouldRecover(){
    const p=(document.body?.dataset?.page||'').toLowerCase();
    if(p==='skills') return $('#skills-grid')?.children.length===0;
    if(p==='gaming') return $('#game-grid')?.children.length===0;
    if(p==='anime') return $('#anime-grid')?.children.length===0;
    if(p==='network') return $('#links-grid')?.children.length===0;
    return false;
  }

  function boot(){ if(shouldRecover()) recover(); else { applySimpleWallpaper(); } }
  addEventListener('error',()=>setTimeout(()=>{ if(shouldRecover()) recover(); },50));
  addEventListener('unhandledrejection',()=>setTimeout(()=>{ if(shouldRecover()) recover(); },50));
  if(document.readyState==='loading') addEventListener('DOMContentLoaded',()=>setTimeout(boot,700),{once:true}); else setTimeout(boot,700);
})();
