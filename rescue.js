(() => {
  'use strict';
  const Q = s => document.querySelector(s);
  const QA = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const data = window.LUCIAN_DATA && typeof window.LUCIAN_DATA === 'object' ? window.LUCIAN_DATA : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  const normalize = () => {
    data.games = arr(data.games); data.anime = arr(data.anime); data.skills = arr(data.skills); data.links = arr(data.links);
    data.categories = arr(data.categories);
  };
  normalize();
  const key = 'lv-rescue-owner';
  let owner = localStorage.getItem(key) === '1';
  const categoryAliases = {
    favorite:'favorite',favorites:'favorite',favourites:'favorite','my favorites':'favorite',
    rotation:'rotation','in rotation':'rotation',
    want:'want','want to play':'want',wishlist:'want',backlog:'want',planned:'want',
    completed:'completed',complete:'completed',finished:'completed',done:'completed',
    watching:'watching','currently watching':'watching',planning:'planning',plan:'planning',
    paused:'paused',pause:'paused',dropped:'dropped',drop:'dropped'
  };
  const slug = v => String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const builtins = [
    ['favorite','MY FAVORITES'],['rotation','IN ROTATION'],['want','WANT TO PLAY'],['completed','COMPLETED'],
    ['watching','WATCHING'],['planning','PLANNING'],['paused','PAUSED'],['dropped','DROPPED']
  ];
  const catMap = () => {
    const m = new Map(builtins.map(([id,label]) => [id,label]));
    data.categories.forEach(c => { const id=slug(c.id||c.name||c.label), label=String(c.label||c.name||id).toUpperCase(); if(id)m.set(id,label); });
    return m;
  };
  const itemCats = (item, type) => {
    const m = catMap(), out=[];
    const raw=[];
    if(Array.isArray(item.categories)) raw.push(...item.categories);
    if(item.category) raw.push(item.category);
    if(type==='anime' && item.status) raw.push(item.status);
    if(item.favorite) raw.push('favorite');
    raw.forEach(x=>{ const k=String(x?.id||x?.slug||x?.name||x?.label||x).toLowerCase().trim(); const id=categoryAliases[k] || slug(k); if(id && m.has(id) && !out.includes(id)) out.push(id); });
    if(!out.length) out.push(type==='game'?'rotation':'planning');
    return out;
  };
  function ownerUI(){
    document.body.classList.toggle('owner-unlocked', owner);
    QA('.owner-only').forEach(e=>{e.hidden=!owner;e.setAttribute('aria-hidden',String(!owner));});
    const s=Q('#owner-state'); if(s)s.textContent=owner?'OWNER MODE':'LOCKED';
  }
  function navFix(){
    QA('nav a').forEach(a=>{a.style.display='inline-flex';a.style.padding='8px 0';a.style.minHeight='34px';a.style.alignItems='center';a.addEventListener('click',()=>Q('#nav')?.classList.remove('open'));});
  }
  function renderSkills(){const el=Q('#skills-grid'); if(!el||el.children.length&&!el.querySelector('.empty'))return; el.innerHTML=data.skills.length?data.skills.map((s,i)=>`<article class="card skill-card" id="skill-${i}"><div class="skill-top"><span class="skill-name">${esc(s.name)}</span><span class="level">${Math.max(0,Math.min(100,Number(s.level)||0))}%</span></div><div class="bar"><span style="width:${Math.max(0,Math.min(100,Number(s.level)||0))}%"></span></div><p class="card-desc">${esc(s.desc||'')}</p></article>`).join(''):'<div class="empty">No skills yet.</div>';}
  function renderArchive(type){
    const grid=Q(type==='game'?'#game-grid':'#anime-grid'); if(!grid)return;
    const items=type==='game'?data.games:data.anime;
    const source=items.map((x,i)=>({x,i,cats:new Set(itemCats(x,type))}));
    const toolbar=Q(type==='game'?'.game-toolbar':'.anime-toolbar');
    if(toolbar && !toolbar.dataset.rescue){
      const cats=[...new Set(source.flatMap(e=>[...e.cats]))];
      toolbar.innerHTML='<button class="filter active" data-rescue-filter="all" type="button">ALL</button>'+cats.map(id=>`<button class="filter" data-rescue-filter="${esc(id)}" type="button">${esc(catMap().get(id)||id.replace(/-/g,' ').toUpperCase())}</button>`).join('');
      toolbar.dataset.rescue='1';
      toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-rescue-filter]');if(!b)return;QA('[data-rescue-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.rescueFilter||'all');});
    }
    function draw(filter='all'){
      const visible=source.filter(e=>filter==='all'||e.cats.has(filter));
      grid.innerHTML=visible.length?visible.map(e=>{
        const x=e.x; if(type==='game')return `<article class="card archive-card"><div class="poster-frame"><img class="poster" src="${esc(x.poster||'')}" alt="${esc(x.title||'')} poster" loading="lazy"><span class="source-badge">${esc(x.source==='steam'?'STEAM':'MANUAL')}</span></div><div class="card-body"><div class="category-tags">${[...e.cats].map(id=>`<span class="tag">${esc(catMap().get(id)||id)}</span>`).join('')}</div><h3>${esc(x.title||'Untitled')}</h3><div class="game-meta"><span>${esc(x.rank||'No rank')}</span><span>${Number(x.progress)||0}%</span></div><div class="progress-line"><span style="width:${Math.max(0,Math.min(100,Number(x.progress)||0))}%"></span></div></div></article>`;
        return `<article class="card anime-card archive-card"><div class="poster-frame anime"><img class="poster" src="${esc(x.poster||'')}" alt="${esc(x.title||'')} poster" loading="lazy"><span class="source-badge">${x.anilistId?'ANILIST':'MANUAL'}</span></div><div class="card-body"><div class="category-tags">${[...e.cats].map(id=>`<span class="tag">${esc(catMap().get(id)||id)}</span>`).join('')}</div><h3>${esc(x.title||'Untitled')}</h3><div class="anime-meta"><span>EP ${Number(x.episode)||0}/${Number(x.totalEpisodes)||'?'}</span><span>${esc(x.score||'NO SCORE')}</span></div></div></article>`;
      }).join(''):'<div class="empty">Nothing matches this view.</div>';
    }
    draw('all');
  }
  function boot(){
    ownerUI(); navFix(); renderSkills(); renderArchive('game'); renderArchive('anime');
    window.addEventListener('error',()=>{setTimeout(()=>{ownerUI();renderSkills();renderArchive('game');renderArchive('anime');},0);});
  }
  window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='l'){e.preventDefault();owner=!owner;localStorage.setItem(key,owner?'1':'0');ownerUI();}});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
