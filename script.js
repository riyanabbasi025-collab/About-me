(() => {
  'use strict';

  const KEY = 'lucian-vex-site-v5';
  const PUBLISHED_CACHE_KEY = 'lucian-vex-published-cache-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const PAGE = document.body?.dataset?.page || 'home';
  const pageUrl = (page, hash = '') => `${page}.html${hash}`;

  const SUPABASE_CONFIG = window.LUCIAN_SUPABASE_CONFIG || {};
  const SUPABASE_URL = String(SUPABASE_CONFIG.url || '').trim();
  const SUPABASE_KEY = String(SUPABASE_CONFIG.publishableKey || '').trim();
  const cloudEnabled = Boolean(window.supabase && SUPABASE_URL && SUPABASE_KEY);
  const supabaseClient = cloudEnabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  let cloudSession = null;
  let cloudOwner = false;
  let saved = null;
  let cachedPublished = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  try { cachedPublished = JSON.parse(localStorage.getItem(PUBLISHED_CACHE_KEY) || 'null'); } catch (_) {}
  let data = clone(cachedPublished || saved || window.LUCIAN_DATA || {});
  data.profile ||= {};
  data.skills ||= [];
  data.games ||= [];
  data.anime ||= [];
  data.links ||= [];

  async function loadPublishedData() {
    if (cloudEnabled) {
      try {
        const { data: row, error } = await supabaseClient.from('lucian_site_data').select('data,updated_at').eq('id', 1).single();
        if (error) throw error;
        if (row?.data && typeof row.data === 'object') {
          const normalized = normalizeData(row.data);
          try { localStorage.setItem(PUBLISHED_CACHE_KEY, JSON.stringify(normalized)); } catch (_) {}
          return normalized;
        }
      } catch (error) {
        console.warn('Lucian Vex: cloud data unavailable; using cached/bundled data.', error);
      }
    }
    return normalizeData(cachedPublished || saved || window.LUCIAN_DATA || {});
  }

  async function loadOwnerSession() {
    if (!cloudEnabled) return null;
    try {
      const { data: authData } = await supabaseClient.auth.getSession();
      cloudSession = authData?.session || null;
      cloudOwner = false;
      if (cloudSession?.user) {
        const { data: row, error } = await supabaseClient.from('lucian_site_data').select('owner_uid').eq('id', 1).single();
        if (!error && row?.owner_uid) cloudOwner = String(row.owner_uid) === String(cloudSession.user.id);
      }
      return cloudSession;
    } catch (_) { return null; }
  }

  async function loadCloudForOwner() {
    if (!cloudEnabled || !cloudSession) return false;
    try {
      const { data: row, error } = await supabaseClient.from('lucian_site_data').select('data').eq('id', 1).single();
      if (error) throw error;
      if (row?.data) { data = normalizeData(row.data); return true; }
    } catch (error) { console.error(error); showToast('Cloud data could not be loaded'); }
    return false;
  }


  const BUILTIN_CATEGORIES = [
    { id: 'favorite', label: 'MY FAVORITES', builtin: true },
    { id: 'rotation', label: 'IN ROTATION', builtin: true },
    { id: 'want', label: 'WANT TO PLAY', builtin: true },
    { id: 'completed', label: 'COMPLETED', builtin: true },
    { id: 'watching', label: 'WATCHING', builtin: true },
    { id: 'planning', label: 'PLANNING', builtin: true },
    { id: 'paused', label: 'PAUSED', builtin: true },
    { id: 'dropped', label: 'DROPPED', builtin: true }
  ];

  function slugCategory(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  }

  function normalizeCategoryToken(value) {
    if (value == null) return '';
    if (typeof value === 'object') return String(value.id || value.slug || value.name || value.label || '').trim();
    return String(value).trim();
  }

  function categoryIdFromToken(token, categorySource = data?.categories || []) {
    const raw = normalizeCategoryToken(token);
    if (!raw) return '';
    const slug = slugCategory(raw);
    const lower = raw.toLowerCase();
    const aliases = {
      favorite:'favorite', favourites:'favorite', favorites:'favorite', 'my favorites':'favorite', 'my favourite games':'favorite', favourite:'favorite',
      rotation:'rotation', 'in rotation':'rotation', 'games in rotation':'rotation',
      want:'want', 'want to play':'want', wishlist:'want', backlog:'want', planned:'want', 'games i want to play':'want',
      completed:'completed', complete:'completed', finished:'completed', done:'completed',
      watching:'watching', 'currently watching':'watching',
      planning:'planning', plannedanime:'planning', plan:'planning',
      paused:'paused', pause:'paused',
      dropped:'dropped', drop:'dropped'
    };
    if (aliases[lower]) return aliases[lower];
    const byId = (categorySource || []).find(x => String(x?.id || '').trim().toLowerCase() === lower || slugCategory(x?.id) === slug);
    if (byId) return String(byId.id);
    const byLabel = (categorySource || []).find(x => String(x?.label || '').trim().toLowerCase() === lower || slugCategory(x?.label) === slug);
    return byLabel ? String(byLabel.id) : (slug || raw.toLowerCase());
  }

  function normalizeCategoryLibrary(value) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const result = [];
    [...BUILTIN_CATEGORIES, ...source].forEach(item => {
      const label = String(item?.label || item?.name || item?.id || '').trim();
      const id = slugCategory(item?.id || item?.slug || label);
      if (!id || !label || seen.has(id)) return;
      seen.add(id);
      result.push({ id, label, builtin: Boolean(item?.builtin || BUILTIN_CATEGORIES.some(x => x.id === id)) });
    });
    return result;
  }

  function legacyCategoryId(type, item) {
    if (type === 'game') {
      const tokens = [];
      if (item?.category != null) tokens.push(item.category);
      if (item?.status != null) tokens.push(item.status);
      if (item?.favorite === true) tokens.push('favorite');
      for (const token of tokens) {
        const raw = normalizeCategoryToken(token).toLowerCase();
        if (['favorite','favourite','favorites','favourites','my favorites','my favourite games'].includes(raw)) return 'favorite';
        if (['want','want to play','wishlist','backlog','planned'].includes(raw)) return 'want';
        if (['completed','complete','finished','done'].includes(raw)) return 'completed';
        if (['rotation','in rotation','games in rotation'].includes(raw)) return 'rotation';
      }
      return 'rotation';
    }
    if (type === 'anime') {
      const status = normalizeAnimeStatus(item?.status).toLowerCase();
      return ({ watching:'watching', completed:'completed', planning:'planning', paused:'paused', dropped:'dropped', favorite:'favorite' })[status] || 'planning';
    }
    return '';
  }

  function itemCategories(type, item, categorySource = data?.categories || []) {
    const categories = Array.isArray(categorySource) ? categorySource : [];
    const libraryIds = new Set(categories.map(x => String(x?.id || '')));
    const rawCats = [];
    if (Array.isArray(item?.categories)) rawCats.push(...item.categories);
    if (item?.category != null) rawCats.push(item.category);
    if (type === 'anime' && item?.status != null) rawCats.push(item.status);
    if (item?.favorite === true) rawCats.push('favorite');

    let cats = rawCats.map(token => categoryIdFromToken(token, categories))
      .filter(Boolean)
      .filter(id => libraryIds.has(id));
    if (!cats.length) {
      const legacy = legacyCategoryId(type, item);
      if (legacy && libraryIds.has(legacy)) cats.push(legacy);
    }
    return [...new Set(cats)];
  }

  function categoryLabel(id) {
    return (data.categories || []).find(x => x.id === id)?.label || String(id || '').replace(/-/g, ' ').toUpperCase();
  }

  function normalizeData(source) {
    const value = clone(source || {});
    value.profile ||= {};
    value.skills ||= [];
    value.games ||= [];
    value.anime ||= [];
    value.links ||= [];
    if (!value.profile.contact) value.profile.contact = {};
    if (!value.profile.discordProfile && value.profile.discord_profile) value.profile.discordProfile = value.profile.discord_profile;
    if (!value.profile.liveWallpaper && value.profile.discordProfile?.liveWallpaper) value.profile.liveWallpaper = clone(value.profile.discordProfile.liveWallpaper);
    value.categories = normalizeCategoryLibrary(value.categories);

    value.games.forEach(item => {
      item.categories = itemCategories('game', item, value.categories);
      item.category = item.categories[0] || 'rotation';
      item.achievements = Array.isArray(item.achievements) ? item.achievements : (item.achievements ? [String(item.achievements)] : []);
      item.rating = item.rating === '' || item.rating == null ? '' : Number(item.rating) || 0;
      item.source = item.source || (item.steamAppId ? 'steam' : 'manual');
      if (item.steamAppId && !item.steamUrl) item.steamUrl = `https://store.steampowered.com/app/${item.steamAppId}/`;
    });
    value.anime.forEach(item => {
      item.categories = itemCategories('anime', item, value.categories);
      const statusCategory = item.categories.find(id => ['watching','completed','planning','paused','dropped'].includes(id));
      if (statusCategory) item.status = statusCategory.charAt(0).toUpperCase() + statusCategory.slice(1);
      item.favorite = item.categories.includes('favorite') || Boolean(item.favorite);
      if (item.favorite && !item.categories.includes('favorite')) item.categories.push('favorite');
    });
    return value;
  }

  const modal = $('#modal');
  const content = $('#modal-content');
  const toast = $('#toast');
  let animeFilter = 'all';
  let gameFilter = 'all';
  let gameSearchQuery = '';
  let animeSearchQuery = '';
  let currentPosterData = '';
  let currentPosterTarget = null;
  const steamSearchCache = new Map();

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const safeUrl = value => String(value || '').trim();
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
  const OWNER_PIN = 'LVX-9K7C-Q4PM-2R8N';
  let ownerMode = false;

  function applyOwnerVisibility() {
    document.body.classList.toggle('owner-unlocked', ownerMode);
    $$('.owner-only').forEach(el => {
      el.hidden = !ownerMode;
      el.setAttribute('aria-hidden', String(!ownerMode));
    });
    const state = $('#owner-state');
    if (state) state.textContent = ownerMode ? 'OWNER MODE' : 'LOCKED';
  }

  async function unlockOwner() {
    if (!cloudEnabled) {
      const attempt = prompt('OWNER ACCESS\nEnter your private owner code:');
      if (attempt === OWNER_PIN) { ownerMode = true; try { sessionStorage.setItem('lucian-vex-owner', '1'); } catch (_) {} applyOwnerVisibility(); showToast('Owner mode unlocked'); return true; }
      if (attempt !== null) showToast('Access denied');
      return false;
    }
    if (cloudOwner && cloudSession) { ownerMode = true; await loadCloudForOwner(); applyOwnerVisibility(); showToast('Owner mode unlocked'); return true; }
    openModal(`<p class="eyebrow">SECURE OWNER ACCESS</p><h2 id="modal-title">Lucian Vex Cloud Login</h2><p class="muted-note">This replaces the old local PIN with a real account. Your website edits are stored in the shared cloud database.</p><div class="form-field"><label>EMAIL</label><input id="cloud-email" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="form-field"><label>PASSWORD</label><input id="cloud-password" type="password" autocomplete="current-password" placeholder="Your password"></div><div class="form-grid two"><button class="btn primary form-submit" id="cloud-login" type="button">SIGN IN</button><button class="btn ghost form-submit" id="cloud-signup" type="button">CREATE ACCOUNT</button></div><p class="muted-note">Create the owner account once in Supabase, then use SIGN IN here.</p>`);
    const doLogin = async (signup=false) => {
      const email = $('#cloud-email').value.trim(); const password = $('#cloud-password').value;
      if (!email || !password) return showToast('Enter email and password');
      const result = signup ? await supabaseClient.auth.signUp({ email, password }) : await supabaseClient.auth.signInWithPassword({ email, password });
      if (result.error) return showToast(result.error.message);
      cloudSession = result.data.session || null;
      if (!cloudSession) { closeModal(); showToast('Account created — check your email if confirmation is enabled'); return; }
      await loadOwnerSession();
      if (!cloudOwner) { await supabaseClient.auth.signOut(); cloudSession = null; closeModal(); showToast('This account is not the Lucian Vex owner'); return; }
      ownerMode = true; await loadCloudForOwner(); closeModal(); applyOwnerVisibility(); showToast('Owner mode unlocked');
    };
    $('#cloud-login').addEventListener('click', () => doLogin(false));
    $('#cloud-signup').addEventListener('click', () => doLogin(true));
    return false;
  }

  async function lockOwner() {
    ownerMode = false;
    if (cloudEnabled && cloudSession) { try { await supabaseClient.auth.signOut(); } catch (_) {} cloudSession = null; cloudOwner = false; }
    try { sessionStorage.removeItem('lucian-vex-owner'); } catch (_) {}
    applyOwnerVisibility();
    closeModal();
    showToast('Owner mode locked');
  }


  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  async function persist(message = 'Saved') {
    if (!ownerMode) return showToast('Owner mode is locked');
    if (cloudEnabled && cloudSession) {
      try {
        const { error } = await supabaseClient.from('lucian_site_data').update({ data: normalizeData(data), updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) throw error;
        try { localStorage.removeItem(KEY); } catch (_) {}
        renderAll();
        showToast(message + ' • synced');
        return;
      } catch (error) {
        console.error(error);
        showToast('Cloud save failed — nothing was published');
        return;
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(data)); renderAll(); showToast(message); }
    catch (error) { showToast('Storage is full — use smaller posters'); console.error(error); }
  }

  function openModal(html) {
    content.innerHTML = html;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    content.querySelector('input,textarea,select')?.focus();
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    content.innerHTML = '';
    currentPosterData = '';
    currentPosterTarget = null;
  }

  function getArray(type) {
    return type === 'skill' ? data.skills : type === 'game' ? data.games : type === 'anime' ? data.anime : data.links;
  }

  function renderProfile() {
    const p = data.profile || {};
    const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    setText('#profile-name', p.name || 'Lucian Vex');
    setText('#profile-bio', p.bio || '');
    setText('#discord', p.discord || '');
    setText('#email', p.email || '');
    const contact = p.contact || {};
    const contactTitle = $('#contact-title');
    const contactText = $('#contact-text');
    if (contactTitle) contactTitle.innerHTML = esc(contact.title || 'Contact') + ' <i>me</i>';
    if (contactText) contactText.textContent = contact.text || 'Open to conversations, collaborations, games, projects, or just a good conversation.';
    setText('#stat-skills', data.skills.length);
    setText('#stat-games', data.games.length);
    setText('#stat-anime', data.anime.length);
    const chips = Array.isArray(p.chips) && p.chips.length ? p.chips : ['SELF-TAUGHT','CREATIVE','GAMER','BUILDER'];
    const chipEl = $('#profile-chips');
    if (chipEl) chipEl.innerHTML = chips.map(c => `<span>${esc(c)}</span>`).join('');
  }

  function renderSkills() {
    const el = $('#skills-grid');
    if (!el) return;
    if (!data.skills.length) { el.innerHTML = '<div class="empty">No skills yet. Use ADD SKILL to create one.</div>'; return; }
    el.innerHTML = data.skills.map((item, i) => `
      <article class="card skill-card" id="skill-${i}">
        <div class="skill-top"><span class="skill-name">${esc(item.name)}</span><span class="level">${clamp(item.level,0,100)}%</span></div>
        <div class="bar"><span style="width:${clamp(item.level,0,100)}%"></span></div>
        <p class="card-desc">${esc(item.desc || '')}</p>
        <div class="card-actions" style="padding:16px 0 0"><span></span><span>
          <button class="icon-btn owner-only" data-edit="skill" data-i="${i}" type="button">EDIT</button>
          <button class="icon-btn owner-only" data-del="skill" data-i="${i}" type="button">DELETE</button>
        </span></div>
      </article>`).join('');
  }

  function normalizeGameCategory(item) {
    return itemCategories('game', item)[0] || 'rotation';
  }

  function renderCategoryFilters(type) {
    const toolbar = type === 'game' ? $('.game-toolbar') : $('.anime-toolbar');
    if (!toolbar) return;
    const used = new Set();
    (data[type === 'game' ? 'games' : 'anime'] || []).forEach(item => itemCategories(type, item).forEach(id => used.add(id)));
    const cats = (data.categories || []).filter(cat => used.has(cat.id));
    const filter = type === 'game' ? gameFilter : animeFilter;
    const allLabel = type === 'game' ? 'ALL GAMES' : 'ALL ANIME';
    toolbar.innerHTML = `<button class="filter ${filter==='all'?'active':''}" data-category-filter="all" type="button">${allLabel}</button>` + cats.map(cat => `<button class="filter ${filter===cat.id?'active':''}" data-category-filter="${esc(cat.id)}" type="button">${esc(cat.label)}</button>`).join('');
  }

  function gameCategoryLabel(category) {
    return categoryLabel(category) || 'IN ROTATION';
  }

  const GAME_PAGE_SIZE = 48;
  const ANIME_PAGE_SIZE = 48;
  let gameVisibleLimit = GAME_PAGE_SIZE;
  let animeVisibleLimit = ANIME_PAGE_SIZE;

  function renderGames() {
    const el = $('#game-grid');
    if (!el) return;
    renderCategoryFilters('game');
    if (!data.games.length) { el.innerHTML = '<div class="empty">No games yet. Use ADD GAME or STEAM SEARCH to create one.</div>'; updateLoadMore('game', false); return; }
    const filtered = data.games.filter(item => {
      const q = gameSearchQuery;
      const cats = itemCategories('game', item);
      const hay = [item.title,item.status,item.type,item.goal,(item.achievements||[]).join(' '),cats.map(categoryLabel).join(' ')].join(' ').toLowerCase();
      const categoryMatch = gameFilter === 'all' || cats.includes(gameFilter) || String(item.category || '').toLowerCase() === String(gameFilter).toLowerCase();
      return categoryMatch && (!q || hay.includes(q));
    });
    const gameCountLabel=$('#game-count-label'); if(gameCountLabel) gameCountLabel.textContent=`${filtered.length} / ${data.games.length} GAMES`;
    if (!filtered.length) { el.innerHTML = '<div class="empty">Nothing matches this game view.</div>'; updateLoadMore('game', false); return; }
    const visible = filtered.slice(0, gameVisibleLimit);
    el.innerHTML = visible.map(item => {
      const i = data.games.indexOf(item);
      const categories = itemCategories('game', item);
      const achievements = Array.isArray(item.achievements) ? item.achievements : [];
      const categoryTags = categories.length ? categories.map(id => `<span class="tag">${esc(gameCategoryLabel(id))}</span>`).join('') : '<span class="tag">IN ROTATION</span>';
      const rating = item.rating === '' || item.rating == null ? '—' : Number(item.rating).toFixed(1);
      return `
      <article class="card archive-card" id="game-${i}">
        <div class="poster-frame"><img class="poster" src="${esc(item.poster || '')}" alt="${esc(item.title || '')}" loading="lazy" onerror="this.closest('.poster-frame').classList.add('broken');this.remove()"><span class="source-badge">${item.source==='steam'?'STEAM':'MANUAL'}</span></div>
        <div class="card-body">
          <div class="category-tags">${categoryTags}</div>
          <h3>${esc(item.title || 'Untitled')}</h3>
          <div class="game-meta"><span>${esc(item.rank || 'No rank')}</span><span>${clamp(item.progress,0,100)}%</span></div>
          <div class="progress-line"><span style="width:${clamp(item.progress,0,100)}%"></span></div>
          <div class="rating-line"><span>LUCian RATING</span><strong>${rating === '—' ? 'NOT RATED' : `${rating}/10`}</strong></div>
          ${achievements.length ? `<p class="card-desc game-achievements"><strong>${achievements.length}</strong> achievement${achievements.length===1?'':'s'} logged</p>` : ''}
          ${item.goal ? `<p class="card-desc" style="margin-top:9px">${esc(item.goal)}</p>` : ''}
          <button class="details-btn" data-details="game" data-i="${i}" type="button">VIEW DETAILS ↗</button>
        </div>
        <div class="card-actions"><span></span><span>
          <button class="icon-btn owner-only ${itemCategories('game', item).includes('favorite')?'active':''}" data-fav="game" data-i="${i}" type="button">${itemCategories('game', item).includes('favorite')?'♥':'♡'}</button>
          <button class="icon-btn owner-only" data-edit="game" data-i="${i}" type="button">EDIT</button>
          <button class="icon-btn owner-only" data-del="game" data-i="${i}" type="button">DELETE</button>
        </span></div>
      </article>`;
    }).join('');
    updateLoadMore('game', filtered.length > visible.length);
  }

  function normalizeAnimeStatus(value) {
    const raw = String(value || '').trim().toLowerCase();
    const map = { watching: 'Watching', completed: 'Completed', planning: 'Planning', paused: 'Paused', dropped: 'Dropped', favorite: 'Favorite', favourites: 'Favorite', favorites: 'Favorite' };
    return map[raw] || String(value || 'Planning').trim() || 'Planning';
  }

  function renderAnime() {
    const el = $('#anime-grid');
    if (!el) return;
    renderCategoryFilters('anime');
    if (!data.anime.length) { el.innerHTML = '<div class="empty">No anime yet. Use ANILIST SEARCH or ADD MANUALLY to create one.</div>'; updateLoadMore('anime', false); return; }
    const filtered = data.anime.filter(item => {
      const q = animeSearchQuery;
      const cats = itemCategories('anime', item);
      const hay = [item.title,item.status,item.notes,cats.map(categoryLabel).join(' ')].join(' ').toLowerCase();
      const categoryMatch = animeFilter === 'all' || cats.includes(animeFilter) || String(item.status || '').toLowerCase() === String(animeFilter).toLowerCase();
      return categoryMatch && (!q || hay.includes(q));
    });
    const animeCountLabel=$('#anime-count-label'); if(animeCountLabel) animeCountLabel.textContent=`${filtered.length} / ${data.anime.length} ANIME`;
    if (!filtered.length) { el.innerHTML = '<div class="empty">Nothing matches this anime view.</div>'; updateLoadMore('anime', false); return; }
    const visible = filtered.slice(0, animeVisibleLimit);
    el.innerHTML = visible.map(item => {
      const i = data.anime.indexOf(item);
      const pct = item.totalEpisodes ? clamp(Math.round((item.episode || 0) / item.totalEpisodes * 100), 0, 100) : 0;
      const categories = itemCategories('anime', item);
      const categoryTags = categories.length ? categories.map(id => `<span class="tag">${esc(categoryLabel(id))}</span>`).join('') : '<span class="tag">PLANNING</span>';
      return `
      <article class="card anime-card archive-card" id="anime-${i}">
        <div class="poster-frame anime"><img class="poster" src="${esc(item.poster || '')}" alt="${esc(item.title || '')}" loading="lazy" onerror="this.closest('.poster-frame').classList.add('broken');this.remove()"><span class="source-badge">${item.anilistId?'ANILIST':'MANUAL'}</span></div>
        <div class="card-body">
          <div class="category-tags">${categoryTags}</div>
          <h3>${esc(item.title || 'Untitled')}</h3>
          <div class="anime-meta"><span>EP ${item.episode || 0}/${item.totalEpisodes || '?'}</span><span>${item.score !== '' && item.score != null ? esc(item.score) + '/10' : 'NO SCORE'}</span></div>
          <div class="progress-line"><span style="width:${pct}%"></span></div>
          <p class="card-desc" style="margin-top:10px">${esc(item.notes || '')}</p>
          <button class="details-btn" data-details="anime" data-i="${i}" type="button">VIEW DETAILS ↗</button>
        </div>
        <div class="card-actions"><button class="favorite owner-only ${item.favorite ? 'active' : ''}" data-fav="anime" data-i="${i}" type="button" aria-label="${item.favorite ? 'Remove favorite' : 'Add favorite'}">${item.favorite ? '♥' : '♡'}</button><span>
          <button class="icon-btn owner-only" data-edit="anime" data-i="${i}" type="button">EDIT</button>
          <button class="icon-btn owner-only" data-del="anime" data-i="${i}" type="button">DELETE</button>
        </span></div>
      </article>`;
    }).join('');
    updateLoadMore('anime', filtered.length > visible.length);
  }

  const ICON_SLUGS = {
    github: 'github', git: 'github', youtube: 'youtube', instagram: 'instagram',
    facebook: 'facebook', tiktok: 'tiktok', discord: 'discord', twitter: 'x', x: 'x',
    reddit: 'reddit', twitch: 'twitch', spotify: 'spotify', linkedin: 'linkedin',
    telegram: 'telegram', reddit: 'reddit', steam: 'steam', itch: 'itchdotio',
    website: 'googlechrome', web: 'googlechrome'
  };

  function iconSlug(item) {
    const name = String(item.name || '').toLowerCase().trim();
    const code = String(item.icon || '').toLowerCase().trim();
    let host = '';
    try { host = new URL(item.url || '').hostname.toLowerCase().replace(/^www\./, ''); } catch (_) {}
    if (host.includes('github.com') || /^(gh|github)$/.test(code) || name.includes('github')) return 'github';
    if (host.includes('youtube.com') || host.includes('youtu.be') || code === 'yt' || name.includes('youtube')) return 'youtube';
    if (host.includes('instagram.com') || code === 'ig' || name.includes('instagram')) return 'instagram';
    if (host.includes('facebook.com') || code === 'fb' || name.includes('facebook')) return 'facebook';
    if (host.includes('tiktok.com') || code === 'tt' || name.includes('tiktok')) return 'tiktok';
    if (host.includes('discord.com') || host.includes('discord.gg') || code === 'discord' || name.includes('discord')) return 'discord';
    if (host === 'x.com' || host.endsWith('.x.com') || name === 'x' || name.startsWith('x /') || code === 'x' || name.includes('twitter')) return 'x';
    if (host.includes('reddit.com') || name.includes('reddit')) return 'reddit';
    if (host.includes('twitch.tv') || name.includes('twitch')) return 'twitch';
    if (host.includes('spotify.com') || name.includes('spotify')) return 'spotify';
    if (host.includes('linkedin.com') || name.includes('linkedin')) return 'linkedin';
    if (host.includes('telegram.me') || host.includes('t.me') || name.includes('telegram')) return 'telegram';
    if (host.includes('steampowered.com') || name.includes('steam')) return 'steam';
    return '';
  }

  function iconMarkup(item) {
    const slug = iconSlug(item);
    if (slug) return `<img src="https://cdn.simpleicons.org/${slug}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    return `<span>${esc(item.icon || '↗')}</span>`;
  }

  function renderLinks() {
    const el = $('#links-grid');
    if (!el) return;
    if (!data.links.length) { el.innerHTML = '<div class="empty">No connections yet. Use ADD CONNECTION to create one.</div>'; return; }
    el.innerHTML = data.links.map((item, i) => `
      <article class="card link-card" id="link-${i}" data-href="${esc(safeUrl(item.url))}" role="link" tabindex="0" aria-label="Open ${esc(item.name)}">
        <a class="link-card-main" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(item.name)}">
          <div class="link-icon">${iconMarkup(item)}</div>
          <div style="flex:1"><strong>${esc(item.name)}</strong><p>${esc(item.role || '')}</p></div>
          <span class="link-open-arrow">↗</span>
        </a>
        <div class="link-card-actions"><button class="icon-btn owner-only" data-edit="link" data-i="${i}" type="button">EDIT</button> <button class="icon-btn owner-only" data-del="link" data-i="${i}" type="button">DELETE</button></div>
      </article>`).join('');
  }

  function updateLoadMore(type, show) {
    const id = type === 'game' ? 'game-load-more' : 'anime-load-more';
    const btn = document.getElementById(id);
    if (btn) btn.hidden = !show;
  }

  function renderHomeDashboard() {
    const set = (id, value, html=false) => { const el=$(id); if (!el) return; html ? el.innerHTML=value : el.textContent=value; };
    set('#home-games-count', data.games.length); set('#home-anime-count', data.anime.length); set('#home-skills-count', data.skills.length);
    const currentGames = data.games.filter(g => itemCategories('game', g).includes('rotation')).slice(0,3);
    const currentAnime = data.anime.filter(a => itemCategories('anime', a).includes('watching')).slice(0,3);
    const renderMini = (items, type) => items.length ? items.map((item) => `<article class="mini-archive"><div class="mini-cover"><img src="${esc(item.poster || '')}" alt="" loading="lazy"></div><div><strong>${esc(item.title)}</strong><small>${type==='game' ? `${clamp(item.progress,0,100)}% progress` : `EP ${item.episode||0}/${item.totalEpisodes||'?'}`}</small></div></article>`).join('') : '<div class="empty">Nothing here yet.</div>';
    set('#home-current-games', renderMini(currentGames,'game'), true); set('#home-current-anime', renderMini(currentAnime,'anime'), true);
    const updates=[];
    data.games.forEach((item,i)=>{if(item.updatedAt) updates.push({type:'GAME',title:item.title,time:item.updatedAt,index:i,page:'gaming.html'});});
    data.anime.forEach((item,i)=>{if(item.updatedAt) updates.push({type:'ANIME',title:item.title,time:item.updatedAt,index:i,page:'anime.html'});});
    data.skills.forEach((item,i)=>{if(item.updatedAt) updates.push({type:'SKILL',title:item.name,time:item.updatedAt,index:i,page:'skills.html'});});
    const list=updates.sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,8);
    set('#recent-updates', list.length ? list.map(u=>`<button class="update-row" data-deeplink="${u.page}#${u.type.toLowerCase()}-${u.index}" type="button"><span>${esc(u.type)}</span><strong>${esc(u.title)}</strong><small>${formatRelative(u.time)}</small></button>`).join('') : '<div class="empty">Your update history will appear here as you edit the archive.</div>', true);
  }

  function formatRelative(value) {
    const diff=Math.max(0,Date.now()-new Date(value).getTime()); const mins=Math.floor(diff/60000); if(mins<1) return 'JUST NOW'; if(mins<60) return `${mins}M AGO`; const hrs=Math.floor(mins/60); if(hrs<24) return `${hrs}H AGO`; const days=Math.floor(hrs/24); return `${days}D AGO`;
  }

  function renderAll() { renderProfile(); renderDiscordProfile(); renderSkills(); renderGames(); renderAnime(); renderLinks(); if(PAGE==='home') renderHomeDashboard(); setupReveal(); applyLiveWallpaper(); applyOwnerVisibility(); }

  function getItem(type, index) { return index >= 0 ? getArray(type)[index] : {}; }

  function posterFields(item) {
    return `
      <div class="form-field">
        <label>POSTER</label>
        <div class="file-row">
          <div><input id="f-poster" value="${esc(item.poster || '')}" placeholder="Image URL or local path"></div>
          <label class="btn ghost file-picker">CHOOSE FILE<input id="f-poster-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        </div>
        <p class="muted-note">Choose a local image for your current browser, or paste a public image URL when you want other visitors to see the same poster.</p>
        <div class="poster-preview" id="poster-preview"><img id="poster-preview-img" src="" alt=""><span class="muted-note">Poster attached</span></div>
      </div>`;
  }

  function categoryPickerHTML(type, item) {
    const selected = new Set(itemCategories(type, item));
    const categories = data.categories || [];
    if (!categories.length) return '';
    return `<div class="form-field"><label>CATEGORIES</label><div class="category-picker">${categories.map(cat => `<label class="category-option"><input type="checkbox" name="item-category" value="${esc(cat.id)}" ${selected.has(cat.id) ? 'checked' : ''}><span>${esc(cat.label)}</span></label>`).join('')}</div><p class="muted-note">Pick one or multiple categories. Use CATEGORY SYSTEM in the top bar to create your own.</p></div>`;
  }

  function selectedCategories() {
    return $$('input[name="item-category"]:checked').map(input => input.value);
  }

  function openCategoryManager() {
    if (!ownerMode) return showToast('Owner mode is locked');
    openModal(`<p class="eyebrow">UNIVERSAL // CATEGORY SYSTEM</p><h2 id="modal-title">Manage archive categories</h2><p class="muted-note">These categories are shared by Games and Anime. A single item can belong to multiple categories.</p><div class="category-manager-list" id="category-manager-list"></div><div class="form-grid two"><div class="form-field"><label>NEW CATEGORY</label><input id="new-category-name" placeholder="MASTERPIECES"></div><button class="btn primary" id="add-category" type="button">＋ CREATE CATEGORY</button></div><button class="btn ghost" id="close-category-manager" type="button">DONE</button>`);
    const renderList = () => {
      const list = $('#category-manager-list');
      list.innerHTML = (data.categories || []).map(cat => `<div class="category-manager-row"><span>${esc(cat.label)}</span>${cat.builtin ? '<small>BUILT-IN</small>' : `<button class="icon-btn" data-delete-category="${esc(cat.id)}" type="button">REMOVE</button>`}</div>`).join('');
    };
    renderList();
    $('#add-category').addEventListener('click', async () => {
      const label = $('#new-category-name').value.trim();
      const idBase = slugCategory(label);
      if (!label || !idBase) return showToast('Enter a category name');
      if ((data.categories || []).some(x => x.id === idBase || x.label.toLowerCase() === label.toLowerCase())) return showToast('Category already exists');
      let id = `custom-${idBase}`;
      let suffix = 2;
      while (data.categories.some(x => x.id === id)) id = `custom-${idBase}-${suffix++}`;
      data.categories.push({ id, label: label.toUpperCase(), builtin: false });
      await persist('Category added');
      $('#new-category-name').value = '';
      renderList(); renderCategoryFilters('game'); renderCategoryFilters('anime');
    });
    $('#category-manager-list').addEventListener('click', async event => {
      const btn = event.target.closest('[data-delete-category]');
      if (!btn) return;
      const id = btn.dataset.deleteCategory;
      if (!confirm(`Remove category "${categoryLabel(id)}"? Items will keep their other categories.`)) return;
      data.categories = data.categories.filter(x => x.id !== id);
      data.games.forEach(item => { item.categories = itemCategories('game', item).filter(x => x !== id); item.category = item.categories[0] || 'rotation'; });
      data.anime.forEach(item => { item.categories = itemCategories('anime', item).filter(x => x !== id); item.favorite = item.categories.includes('favorite'); });
      await persist('Category removed');
      renderList(); renderAll();
    });
    $('#close-category-manager').addEventListener('click', closeModal);
  }

  function makeGameFromSteam(game) {
    const appid = game.steam_appid || game.appid || game.id || '';
    const genres = Array.isArray(game.genres) ? game.genres.map(x => x.description || x).filter(Boolean).slice(0,3).join(' • ') : '';
    return {
      title: game.name || 'STEAM GAME', status: 'NOT STARTED', type: genres || 'Steam',
      poster: game.header_image || game.large_capsule_image || game.tiny_image || (appid ? `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg` : ''),
      rank: 'Not played', progress: 0, category: 'want', categories: ['want'], rating: '', goal: (game.short_description || 'Start the game.').replace(/<[^>]*>/g,''),
      achievements: [], steamAppId: appid, steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '', source: 'steam', steamPrice: game.price?.final_formatted || '', updatedAt: new Date().toISOString()
    };
  }

  async function steamSearch() {
    if (!ownerMode) return showToast('Owner mode is locked');
    openModal(`<p class="eyebrow">STEAM // GAME IMPORT</p><h2 id="modal-title">Search Steam</h2><p class="muted-note">Search the Steam catalog, preview the game and import it. Games outside Steam can still be added manually.</p><div class="search-row"><input id="steam-q" placeholder="Search game..." autocomplete="off"><button class="btn primary" id="steam-go" type="button">SEARCH</button></div><div id="steam-results" class="search-results"></div><p class="muted-note">Primary: Steam Store JSON • Fallback: Steam web search + SteamDB</p>`);
    const run = async () => {
      const queryText = $('#steam-q').value.trim(); if (!queryText) return showToast('Type a game name');
      $('#steam-results').innerHTML = '<div class="empty">Searching Steam...</div>';
      try {
        let json=null;
        const response=await fetch(`/.netlify/functions/steam-search?term=${encodeURIComponent(queryText)}`, {headers:{'Accept':'application/json'}});
        if (response.ok) json=await response.json();
        const results=(Array.isArray(json?.items)?json.items:[]).filter(item=>item?.name && item?.id).slice(0,20);
        steamSearchCache.clear(); results.forEach(item=>steamSearchCache.set(String(item.id),item));
        if(!results.length){
          const searchUrl=json?.searchUrl || `https://store.steampowered.com/search/?term=${encodeURIComponent(queryText)}&ignore_preferences=1`;
          $('#steam-results').innerHTML=`<div class="empty">Steam returned no importable results from its API.<div class="search-fallback-actions"><a class="btn ghost small" href="${esc(searchUrl)}" target="_blank" rel="noopener noreferrer">OPEN STEAM SEARCH ↗</a><button class="btn ghost small" id="steam-use-manual" type="button">USE MANUAL ADD</button></div></div>`;
          $('#steam-use-manual')?.addEventListener('click',()=>{ closeModal(); openManager('game',-1); setTimeout(()=>{ const title=$('#f-title'); if(title){ title.value=queryText; title.focus(); } },60); });
          return;
        }
        $('#steam-results').innerHTML=results.map(item=>`<div class="search-result"><img src="${esc(item.tiny_image||item.logo||item.header_image||'')}" alt=""><div><strong>${esc(item.name)}</strong><small>App ID ${esc(item.id)}${item.price?.final_formatted?` • ${esc(item.price.final_formatted)}`:''}</small></div><button class="btn primary small" data-add-steam="${esc(item.id)}" type="button">IMPORT</button></div>`).join('');
      } catch(error){ console.error(error); $('#steam-results').innerHTML=`<div class="empty">Steam search could not be reached. Try the web search fallback below.<div class="search-fallback-actions"><a class="btn ghost small" href="https://store.steampowered.com/search/?term=${encodeURIComponent(queryText)}&ignore_preferences=1" target="_blank" rel="noopener noreferrer">OPEN STEAM SEARCH ↗</a><a class="btn ghost small" href="https://steamdb.info/search/?a=app&q=${encodeURIComponent(queryText)}" target="_blank" rel="noopener noreferrer">SEARCH STEAMDB ↗</a></div></div>`; }
    };
    $('#steam-go')?.addEventListener('click',run); $('#steam-q')?.addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  }

  async function addFromSteam(appid) {
    if (!ownerMode) return showToast('Owner mode is locked');
    const cached = steamSearchCache.get(String(appid)); if (!cached) return showToast('Steam result expired — search again');
    let imported = makeGameFromSteam(cached);
    if (data.games.some(g => String(g.steamAppId || '') === String(appid))) { closeModal(); return showToast('That Steam game is already in your archive'); }
    try {
      try {
        const response = await fetch(`/.netlify/functions/steam-search?appid=${encodeURIComponent(appid)}`);
        if (response.ok) { const json=await response.json(); if(json.game) imported=makeGameFromSteam({...cached,...json.game}); }
      } catch (_) {}
      data.games.push(imported); await persist('Steam game added'); closeModal(); location.href=pageUrl('gaming','#gaming');
    } catch(error){ showToast('Could not import that Steam game'); console.error(error); }
  }

  function openManager(type, index = -1) {
    if (!ownerMode) return showToast('Owner mode is locked');
    const item = clone(getItem(type, index));
    let html = '';
    if (type === 'profile') {
      const profile = data.profile || {};
      const chips = Array.isArray(profile.chips) && profile.chips.length ? profile.chips : ['SELF-TAUGHT','CREATIVE','GAMER','BUILDER'];
      html = `
        <p class="eyebrow">PROFILE MANAGER</p><h2 id="modal-title">Edit About Me</h2>
        <p class="muted-note">Update the information shown in your public About Me card. Changes stay local until you EXPORT your data.js.</p>
        <div class="form-field"><label>NAME</label><input id="f-profile-name" value="${esc(profile.name || 'Lucian Vex')}" placeholder="Lucian Vex"></div>
        <div class="form-field"><label>ABOUT ME</label><textarea id="f-profile-bio" placeholder="Write your public About Me...">${esc(profile.bio || '')}</textarea></div>
        <div class="form-field"><label>PROFILE TAGS</label><input id="f-profile-chips" value="${esc(chips.join(' • '))}" placeholder="SELF-TAUGHT • CREATIVE • GAMER • BUILDER"><p class="muted-note">Separate tags with •</p></div>
        <button class="btn primary form-submit" data-save-manager="profile" data-index="-1" type="button">SAVE ABOUT ME</button>`;
    }
    if (type === 'contact') {
      const contact = data.profile.contact || {};
      html = `
        <p class="eyebrow">CONTACT MANAGER</p><h2 id="modal-title">Edit Contact Me</h2>
        <p class="muted-note">Change the public contact heading, message, Discord handle and email address.</p>
        <div class="form-field"><label>HEADING</label><input id="f-contact-title" value="${esc(contact.title || 'Contact')}" placeholder="Contact"></div>
        <div class="form-field"><label>MESSAGE</label><textarea id="f-contact-text" placeholder="Your contact message">${esc(contact.text || 'Open to conversations, collaborations, games, projects, or just a good conversation.')}</textarea></div>
        <div class="form-grid two">
          <div class="form-field"><label>DISCORD</label><input id="f-contact-discord" value="${esc(data.profile.discord || '')}" placeholder="lucian_vex"></div>
          <div class="form-field"><label>EMAIL</label><input id="f-contact-email" type="email" value="${esc(data.profile.email || '')}" placeholder="you@example.com"></div>
        </div>
        <button class="btn primary form-submit" data-save-manager="contact" data-index="-1" type="button">SAVE CONTACT INFO</button>`;
    }

    if (type === 'skill') html = `
      <p class="eyebrow">SKILL MANAGER</p><h2 id="modal-title">${index < 0 ? 'Add skill' : 'Edit skill'}</h2>
      <div class="form-grid two">
        <div class="form-field"><label>NAME</label><input id="f-name" value="${esc(item.name)}" placeholder="Web Development"></div>
        <div class="form-field"><label>LEVEL (0–100)</label><input id="f-level" type="number" min="0" max="100" value="${item.level ?? 50}"></div>
      </div>
      <div class="form-field"><label>DESCRIPTION</label><textarea id="f-desc" placeholder="What this skill means to you">${esc(item.desc || '')}</textarea></div>
      <button class="btn primary form-submit" data-save-manager="skill" data-index="${index}" type="button">SAVE SKILL</button>`;

    if (type === 'game') html = `
      <p class="eyebrow">GAME MANAGER</p><h2 id="modal-title">${index < 0 ? 'Add game' : 'Edit game'}</h2>
      <div class="form-grid two">
        <div class="form-field"><label>TITLE</label><input id="f-title" value="${esc(item.title)}" placeholder="VALORANT"></div>
        <div class="form-field"><label>STATUS</label><input id="f-status" value="${esc(item.status)}" placeholder="PLAYING"></div>
        <div class="form-field"><label>TYPE</label><input id="f-type" value="${esc(item.type)}" placeholder="Competitive"></div>
        <div class="form-field"><label>RANK</label><input id="f-rank" value="${esc(item.rank)}" placeholder="Silver 2"></div>
        <div class="form-field"><label>PROGRESS %</label><input id="f-progress" type="number" min="0" max="100" value="${item.progress ?? 0}"></div>
        <div class="form-field"><label>LUCIAN RATING /10</label><input id="f-rating" type="number" min="0" max="10" step="0.5" value="${item.rating ?? ''}"></div>
      </div>
      ${categoryPickerHTML('game', item)}
      ${posterFields(item)}
      <div class="form-field"><label>GOAL / NOTE</label><textarea id="f-goal">${esc(item.goal || '')}</textarea></div>
      <div class="form-field"><label>ACHIEVEMENTS / MILESTONES</label><textarea id="f-achievements" placeholder="Finished story • Reached Elite rank • Unlocked secret ending">${esc(Array.isArray(item.achievements) ? item.achievements.join(' • ') : (item.achievements || ''))}</textarea><p class="muted-note">Separate multiple achievements with •</p></div>
      <button class="btn primary form-submit" data-save-manager="game" data-index="${index}" type="button">SAVE GAME</button>`;

    if (type === 'link') html = `
      <p class="eyebrow">CONNECTION MANAGER</p><h2 id="modal-title">${index < 0 ? 'Add connection' : 'Edit connection'}</h2>
      <div class="form-grid">
        <div class="form-field"><label>NAME</label><input id="f-name" value="${esc(item.name)}" placeholder="GITHUB"></div>
        <div class="form-grid two"><div class="form-field"><label>PLATFORM</label><select id="f-platform"><option value="">Auto detect</option><option value="github">GitHub</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="discord">Discord</option><option value="x">X</option><option value="reddit">Reddit</option><option value="twitch">Twitch</option><option value="spotify">Spotify</option><option value="linkedin">LinkedIn</option><option value="telegram">Telegram</option><option value="steam">Steam</option></select></div><div class="form-field"><label>ROLE / DESCRIPTION</label><input id="f-role" value="${esc(item.role || '')}" placeholder="Code & Projects"></div></div><input id="f-icon" value="${esc(item.icon || '')}" type="hidden">
        <div class="form-field"><label>URL</label><input id="f-url" value="${esc(item.url || '')}" placeholder="https://..."></div>
      </div>
      <button class="btn primary form-submit" data-save-manager="link" data-index="${index}" type="button">SAVE CONNECTION</button>`;

    if (type === 'anime') html = `
      <p class="eyebrow">ANIME MANAGER</p><h2 id="modal-title">${index < 0 ? 'Add anime manually' : 'Edit anime'}</h2>
      <div class="form-grid two">
        <div class="form-field"><label>TITLE</label><input id="f-title" value="${esc(item.title)}" placeholder="Anime title"></div>
        <div class="form-field"><label>STATUS</label><select id="f-status"><option>Watching</option><option>Completed</option><option>Planning</option><option>Paused</option><option>Dropped</option></select></div>
        <div class="form-field"><label>CURRENT EPISODE</label><input id="f-episode" type="number" min="0" value="${item.episode ?? 0}"></div>
        <div class="form-field"><label>TOTAL EPISODES</label><input id="f-total" type="number" min="0" value="${item.totalEpisodes ?? 0}"></div>
        <div class="form-field"><label>SCORE /10</label><input id="f-score" type="number" min="0" max="10" step="0.5" value="${item.score ?? ''}"></div>
        <div class="form-field"><label>ANILIST ID (OPTIONAL)</label><input id="f-anilist" value="${item.anilistId || ''}" placeholder="Media ID"></div>
      </div>
      ${categoryPickerHTML('anime', item)}
      <label class="check-row"><input id="f-favorite" type="checkbox" ${item.favorite ? 'checked' : ''}> Mark as favorite</label>
      ${posterFields(item)}
      <div class="form-field"><label>NOTES</label><textarea id="f-notes" placeholder="Personal note">${esc(item.notes || '')}</textarea></div>
      <button class="btn primary form-submit" data-save-manager="anime" data-index="${index}" type="button">SAVE ANIME</button>`;

    openModal(html);
    if (type === 'anime') $('#f-status').value = normalizeAnimeStatus(item.status);
    if (type === 'link') $('#f-platform').value = iconSlug(item) || '';
    setupPosterPicker(item.poster || '');
  }

  function setupPosterPicker(existingUrl = '') {
    const file = $('#f-poster-file');
    const preview = $('#poster-preview');
    const previewImg = $('#poster-preview-img');
    const urlInput = $('#f-poster');
    if (!file) return;
    if (existingUrl) { previewImg.src = existingUrl; preview.classList.add('show'); }
    file.addEventListener('change', async event => {
      const selected = event.target.files?.[0];
      if (!selected) return;
      try {
        currentPosterData = await compressImage(selected);
        previewImg.src = currentPosterData;
        preview.classList.add('show');
        urlInput.value = '';
        showToast('Poster attached');
      } catch (error) { showToast('Could not read image'); console.error(error); }
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 460, maxH = 690;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.74));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function saveManager(type, index) {
    if (!ownerMode) return showToast('Owner mode is locked');
    const item = index >= 0 ? getArray(type)[index] : {};
    if (type === 'profile') {
      const profile = data.profile || (data.profile = {});
      profile.name = $('#f-profile-name').value.trim() || 'Lucian Vex';
      profile.bio = $('#f-profile-bio').value.trim();
      profile.chips = $('#f-profile-chips').value.split('•').map(v => v.trim().toUpperCase()).filter(Boolean).slice(0, 8); profile.updatedAt = new Date().toISOString();
      persist('About Me saved');
      closeModal();
      return;
    }
    if (type === 'contact') {
      const profile = data.profile || (data.profile = {});
      profile.contact ||= {};
      profile.contact.title = $('#f-contact-title').value.trim() || 'Contact';
      profile.contact.text = $('#f-contact-text').value.trim() || 'Open to conversations, collaborations, games, projects, or just a good conversation.';
      profile.discord = $('#f-contact-discord').value.trim();
      profile.email = $('#f-contact-email').value.trim(); profile.updatedAt = new Date().toISOString();
      persist('Contact info saved');
      closeModal();
      return;
    }
    if (type === 'skill') {
      item.name = $('#f-name').value.trim(); item.level = clamp($('#f-level').value,0,100); item.desc = $('#f-desc').value.trim(); item.updatedAt = new Date().toISOString();
      if (!item.name) return showToast('Enter a skill name');
    }
    if (type === 'game') {
      item.title = $('#f-title').value.trim(); item.status = $('#f-status').value.trim(); item.type = $('#f-type').value.trim(); item.rank = $('#f-rank').value.trim(); item.progress = clamp($('#f-progress').value,0,100); item.rating = $('#f-rating')?.value === '' ? '' : clamp($('#f-rating')?.value,0,10); item.categories = selectedCategories(); if (!item.categories.length) item.categories = ['rotation']; item.category = item.categories[0]; item.goal = $('#f-goal').value.trim(); item.achievements = $('#f-achievements').value.split('•').map(v => v.trim()).filter(Boolean).slice(0, 30); item.source = item.source || 'manual'; item.updatedAt = new Date().toISOString();
      if (currentPosterData) item.poster = currentPosterData; else item.poster = safeUrl($('#f-poster').value);
      if (!item.title) return showToast('Enter a game title');
    }
    if (type === 'link') {
      item.name = $('#f-name').value.trim(); const platform = $('#f-platform').value; item.icon = platform || $('#f-icon').value.trim(); item.role = $('#f-role').value.trim(); item.url = safeUrl($('#f-url').value); item.updatedAt = new Date().toISOString();
      if (!item.name || !item.url) return showToast('Enter name and URL');
    }
    if (type === 'anime') {
      item.title = $('#f-title').value.trim(); item.updatedAt = new Date().toISOString(); const chosenCategories = selectedCategories().filter(id => !['watching','completed','planning','paused','dropped'].includes(id)); const statusCategory = String($('#f-status').value || 'Planning').trim().toLowerCase(); const normalizedStatus = ['watching','completed','planning','paused','dropped'].includes(statusCategory) ? statusCategory : 'planning'; item.categories = [normalizedStatus, ...chosenCategories.filter(id => id !== normalizedStatus)]; if ($('#f-favorite').checked && !item.categories.includes('favorite')) item.categories.push('favorite'); item.status = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1); item.episode = Math.max(0, Number($('#f-episode').value)||0); item.totalEpisodes = Math.max(0, Number($('#f-total').value)||0); item.score = $('#f-score').value === '' ? '' : clamp($('#f-score').value,0,10); item.anilistId = $('#f-anilist').value.trim(); item.favorite = item.categories.includes('favorite'); item.notes = $('#f-notes').value.trim();
      if (currentPosterData) item.poster = currentPosterData; else item.poster = safeUrl($('#f-poster').value);
      if (!item.title) return showToast('Enter an anime title');
    }
    if (index < 0) getArray(type).push(item);
    persist(index < 0 ? 'Added' : 'Updated');
    closeModal();
  }

  async function aniSearch() {
    if (!ownerMode) return showToast('Owner mode is locked');
    openModal(`<p class="eyebrow">ANILIST</p><h2 id="modal-title">Search anime</h2><div class="search-row"><input id="ani-q" placeholder="Search anime..."><button class="btn primary" id="ani-go" type="button">SEARCH</button></div><div id="ani-results" class="search-results"></div>`);
    const run = async () => {
      const queryText = $('#ani-q').value.trim();
      if (!queryText) return showToast('Type an anime name');
      $('#ani-results').innerHTML = '<div class="empty">Searching AniList...</div>';
      const query = `query($search:String!){Page(perPage:8){media(search:$search,type:ANIME,isAdult:false){id title{romaji english}coverImage{large}episodes}}}`;
      try {
        const response = await fetch('https://graphql.anilist.co', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({query,variables:{search:queryText}}) });
        const json = await response.json();
        const results = json.data?.Page?.media || [];
        if (!results.length) { $('#ani-results').innerHTML = '<div class="empty">No results found.</div>'; return; }
        $('#ani-results').innerHTML = results.map(item => `<div class="search-result"><img src="${esc(item.coverImage?.large || '')}" alt=""><div><strong>${esc(item.title.english || item.title.romaji)}</strong><small>${item.episodes || '?'} episodes</small></div><button class="btn primary small" data-add-anilist="${item.id}" type="button">ADD</button></div>`).join('');
      } catch (error) { $('#ani-results').innerHTML = '<div class="empty">AniList could not be reached. Check your connection.</div>'; console.error(error); }
    };
    $('#ani-go').addEventListener('click', run);
    $('#ani-q').addEventListener('keydown', event => { if (event.key === 'Enter') run(); });
  }

  async function addFromAniList(id) {
    const query = `query($id:Int!){Media(id:$id,type:ANIME){id title{romaji english}coverImage{large}episodes}}`;
    try {
      const response = await fetch('https://graphql.anilist.co', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({query,variables:{id:Number(id)}}) });
      const json = await response.json();
      const item = json.data?.Media;
      if (!item) throw new Error('Anime not found');
      data.anime.push({ title:item.title.english || item.title.romaji, status:'Planning', categories:['planning'], episode:0, totalEpisodes:item.episodes || 0, score:'', favorite:false, notes:'', anilistId:item.id, poster:item.coverImage?.large || '', updatedAt:new Date().toISOString() });
      persist('Anime added');
      closeModal();
      location.href = pageUrl('anime','#anime');
    } catch (error) { showToast('Could not add anime'); console.error(error); }
  }


  let discordAvatarData = '';
  let discordBannerData = '';
  let discordDecorationData = '';
  let discordDecorationCleared = false;

  function discordProfile() {
    data.profile.discordProfile ||= {};
    const p = data.profile.discordProfile;
    p.displayName ||= data.profile.name || 'Lucian Vex';
    p.username ||= data.profile.discord ? `@${data.profile.discord}` : '@lucian_vex';
    p.status ||= data.profile.status || 'ONLINE';
    p.customStatus ||= 'Building systems & collecting worlds.';
    p.about ||= 'Self-taught developer, gamer and anime fan.';
    p.badges ||= ['PROFILE EFFECT READY', 'PERSONAL PROFILE'];
    return p;
  }

  function setImageElement(selector, src, fallbackClass = '') {
    const el = $(selector);
    if (!el) return;
    if (src) {
      el.src = src;
      el.classList.add('loaded');
      if (fallbackClass) el.classList.add(fallbackClass);
    } else {
      el.removeAttribute('src');
      el.classList.remove('loaded');
      if (fallbackClass) el.classList.remove(fallbackClass);
    }
  }

  function renderDiscordProfile() {
    const card = $('#discord-card');
    if (!card) return;
    const p = discordProfile();
    const status = String(p.status || 'ONLINE').toLowerCase();
    const normalized = status === 'dnd' || status === 'do not disturb' ? 'dnd' : (['online','idle','offline'].includes(status) ? status : 'offline');
    const label = normalized === 'dnd' ? 'DO NOT DISTURB' : normalized.toUpperCase();
    card.dataset.status = normalized;
    $('#discord-status-label').textContent = label;
    $('#discord-status-dot').dataset.status = normalized;
    $('#discord-display-name').textContent = p.displayName || 'LUCIAN VEX';
    const user = String(p.username || '@lucian_vex').replace(/^@+/, '');
    $('#discord-username').textContent = '@' + user;
    $('#discord-custom-status').textContent = p.customStatus || 'Building systems & collecting worlds.';
    $('#discord-activity-name').textContent = p.displayName || 'Lucian Vex';
    $('#discord-activity-detail').textContent = p.about || 'Self-taught developer, gamer and anime fan.';
    $('#discord-updated').textContent = p.memberSince ? `MEMBER SINCE ${p.memberSince}` : 'PERSONAL PROFILE';
    $('#discord-open').href = data.profile.discord ? `https://discord.com/users/${encodeURIComponent(data.profile.discord)}` : 'https://discord.com';

    const banner = $('#discord-banner');
    if (banner) {
      banner.style.backgroundImage = p.banner ? `url("${String(p.banner).replace(/"/g, '\\"')}")` : '';
      banner.classList.toggle('has-banner', !!p.banner);
    }

    const avatar = $('#discord-avatar');
    const avatarFallback = $('#discord-avatar-fallback');
    const avatarUrl = p.avatar || '';
    if (avatar) {
      avatar.hidden = !avatarUrl;
      avatar.classList.toggle('loaded', !!avatarUrl);
      avatar.alt = `${p.displayName || 'Lucian Vex'} avatar`;
      avatar.onerror = () => {
        avatar.hidden = true;
        avatar.classList.remove('loaded');
        if (avatarFallback) avatarFallback.hidden = false;
      };
      if (avatarUrl) avatar.src = avatarUrl;
      else avatar.removeAttribute('src');
    }
    if (avatarFallback) {
      const initials = String(p.displayName || 'Lucian Vex').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'LV';
      avatarFallback.textContent = initials;
      avatarFallback.hidden = !!avatarUrl;
    }

    const decoration = $('#discord-decoration');
    if (decoration) {
      if (p.decoration) {
        decoration.src = p.decoration;
        decoration.hidden = false;
        decoration.classList.add('visible');
        decoration.onerror = () => { decoration.hidden = true; decoration.classList.remove('visible'); };
      } else {
        decoration.hidden = true;
        decoration.removeAttribute('src');
        decoration.classList.remove('visible');
      }
    }
    $('#discord-effect-badge').textContent = p.profileEffect === false ? 'PROFILE EFFECT OFF' : 'PROFILE EFFECT READY';
    $('#discord-frame-badge').textContent = (p.badges?.[1] || 'PERSONAL PROFILE').toUpperCase();
    $('#discord-activity').classList.toggle('profile-effect-on', p.profileEffect !== false);
  }

  function fileToDataURL(file, callback) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('Image is too large — keep it under 3 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result || ''));
    reader.onerror = () => showToast('Could not read that image');
    reader.readAsDataURL(file);
  }

  function openDiscordSetup() {
    if (!ownerMode) return showToast('Owner mode is locked');
    const p = discordProfile();
    discordAvatarData = p.avatar || '';
    discordBannerData = p.banner || '';
    discordDecorationData = p.decoration || '';
    discordDecorationCleared = false;
    const badges = (p.badges || []).join(' • ');
    openModal(`<p class="eyebrow">DISCORD // MANUAL PROFILE</p><h2 id="modal-title">Edit your profile card</h2>
      <p class="muted-note">No live Discord connection. Everything below is manually controlled by you and gets saved with your site data.</p>
      <div class="form-grid two">
        <div class="form-field"><label>DISPLAY NAME</label><input id="f-discord-display" value="${esc(p.displayName || '')}" placeholder="LUCIAN VEX"></div>
        <div class="form-field"><label>USERNAME</label><input id="f-discord-username" value="${esc(p.username || '@lucian_vex')}" placeholder="@lucian_vex"></div>
      </div>
      <div class="form-grid two">
        <div class="form-field"><label>STATUS</label><select id="f-discord-status"><option value="ONLINE" ${p.status==='ONLINE'?'selected':''}>ONLINE</option><option value="IDLE" ${p.status==='IDLE'?'selected':''}>IDLE</option><option value="DND" ${p.status==='DND'?'selected':''}>DO NOT DISTURB</option><option value="OFFLINE" ${p.status==='OFFLINE'?'selected':''}>OFFLINE</option></select></div>
        <div class="form-field"><label>MEMBER SINCE</label><input id="f-discord-member" value="${esc(p.memberSince || '')}" placeholder="e.g. 2024"></div>
      </div>
      <div class="form-field"><label>CUSTOM STATUS</label><input id="f-discord-custom" value="${esc(p.customStatus || '')}" placeholder="Building systems & collecting worlds."></div>
      <div class="form-field"><label>ABOUT ME</label><textarea id="f-discord-about" placeholder="Your Discord-style About Me">${esc(p.about || '')}</textarea></div>
      <div class="form-field"><label>AVATAR — URL OR LOCAL IMAGE</label><div class="file-row"><input id="f-discord-avatar" value="${esc((p.avatar || '').startsWith('data:') ? '' : (p.avatar || ''))}" placeholder="https://.../avatar.png"><label class="btn ghost file-picker">CHOOSE AVATAR<input id="f-discord-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label></div><p class="muted-note">Square image recommended. Local files are packaged into your exported data.</p></div>
      <div class="form-field"><label>BANNER — URL OR LOCAL IMAGE</label><div class="file-row"><input id="f-discord-banner" value="${esc((p.banner || '').startsWith('data:') ? '' : (p.banner || ''))}" placeholder="https://.../banner.jpg"><label class="btn ghost file-picker">CHOOSE BANNER<input id="f-discord-banner-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label></div><p class="muted-note">Discord-style banners are wide; 680×240 or larger works well.</p></div>
      <div class="form-field"><label>AVATAR DECORATION — OPTIONAL URL OR LOCAL IMAGE</label><div class="file-row decoration-file-row"><input id="f-discord-decoration" value="${esc((p.decoration || '').startsWith('data:') ? '' : (p.decoration || ''))}" placeholder="Transparent PNG / WebP"><label class="btn ghost file-picker">CHOOSE DECOR<input id="f-discord-decoration-file" type="file" accept="image/png,image/webp,image/gif"></label><button class="btn ghost" id="clear-discord-decoration" type="button">REMOVE DECOR</button></div><p class="muted-note">Use a transparent image sized to frame the avatar. REMOVE DECOR clears any saved decoration completely.</p></div>
      <div class="form-field"><label>BADGE TEXT</label><input id="f-discord-badges" value="${esc(badges)}" placeholder="PROFILE EFFECT READY • PERSONAL PROFILE"></div>
      <label class="check-row"><input id="f-discord-effect" type="checkbox" ${p.profileEffect !== false ? 'checked' : ''}> Enable the subtle profile-effect animation</label>
      <button class="btn primary form-submit" id="save-discord" type="button">SAVE DISCORD PROFILE</button>
      <p class="muted-note">Best results: avatar 512×512, banner 680×240+, transparent decoration image.</p>`);

    $('#f-discord-avatar-file').addEventListener('change', e => fileToDataURL(e.target.files?.[0], value => { discordAvatarData = value; showToast('Avatar attached'); }));
    $('#f-discord-banner-file').addEventListener('change', e => fileToDataURL(e.target.files?.[0], value => { discordBannerData = value; showToast('Banner attached'); }));
    $('#f-discord-decoration-file').addEventListener('change', e => fileToDataURL(e.target.files?.[0], value => { discordDecorationData = value; discordDecorationCleared = false; $('#f-discord-decoration').value = ''; showToast('Decoration attached'); }));
    $('#clear-discord-decoration').addEventListener('click', () => { discordDecorationData = ''; discordDecorationCleared = true; $('#f-discord-decoration').value = ''; showToast('Decoration marked for removal'); });
    $('#save-discord').addEventListener('click', () => {
      const p = discordProfile();
      p.displayName = $('#f-discord-display').value.trim() || 'LUCIAN VEX';
      p.username = $('#f-discord-username').value.trim() || '@lucian_vex';
      p.status = $('#f-discord-status').value;
      p.memberSince = $('#f-discord-member').value.trim();
      p.customStatus = $('#f-discord-custom').value.trim();
      p.about = $('#f-discord-about').value.trim();
      const avatarUrl = $('#f-discord-avatar').value.trim();
      const bannerUrl = $('#f-discord-banner').value.trim();
      const decorationUrl = $('#f-discord-decoration').value.trim();
      p.avatar = discordAvatarData || avatarUrl || '';
      p.banner = discordBannerData || bannerUrl || '';
      if (discordDecorationCleared) {
        delete p.decoration;
      } else {
        p.decoration = discordDecorationData || decorationUrl || '';
      }
      p.profileEffect = $('#f-discord-effect').checked;
      p.badges = $('#f-discord-badges').value.split(/\s*[•|]\s*/).map(v => v.trim()).filter(Boolean).slice(0, 4);
      data.profile.status = p.status;
      persist('Discord profile saved');
      closeModal();
    });
  }

  const THEMES = {
    'vex-noir': {name:'Vex Noir', sub:'Deep black / hot pink / violet', bg:'#08070d', bg2:'#100b18', panel:'#13101b', panel2:'#191322', pink:'#ff2bb5', pink2:'#ff6bd0', purple:'#8b5cf6', purple2:'#b891ff', white:'#f8f6ff', muted:'#aaa2b5', line:'#2d2638'},
    'violet-night': {name:'Violet Night', sub:'Purple first / clean pink accents', bg:'#090711', bg2:'#120d20', panel:'#161125', panel2:'#1d1730', pink:'#ff4fbf', pink2:'#ff83d8', purple:'#7c3aed', purple2:'#ad7cff', white:'#fbf8ff', muted:'#aaa4bd', line:'#312747'},
    'magenta-void': {name:'Magenta Void', sub:'Black / magenta / electric violet', bg:'#090509', bg2:'#150813', panel:'#170b18', panel2:'#211022', pink:'#ff168e', pink2:'#ff5bb7', purple:'#9d4edd', purple2:'#c084fc', white:'#fff8fd', muted:'#b7a2b1', line:'#352037'},
    'royal-pulse': {name:'Royal Pulse', sub:'Dark navy / royal purple / pink', bg:'#070913', bg2:'#0d1020', panel:'#101427', panel2:'#171b33', pink:'#ff3bbd', pink2:'#ff79d4', purple:'#6366f1', purple2:'#a78bfa', white:'#f7f8ff', muted:'#a5abc1', line:'#28304c'}
  };

  function applyTheme(name, colors = null, persistData = true) {
    const theme = colors || THEMES[name] || THEMES['vex-noir'];
    const root = document.documentElement;
    ['bg','bg2','panel','panel2','pink','pink2','purple','purple2','white','muted','line'].forEach(key => root.style.setProperty(`--${key}`, theme[key]));
    const state = { name: name || 'vex-noir', custom: !!colors, colors: { ...theme } };
    try { localStorage.setItem('lucian-vex-theme', JSON.stringify(state)); } catch (_) {}
    if (persistData && data?.profile) data.profile.theme = state;
    document.body.dataset.theme = name || 'custom';
  }

  function loadTheme() {
    const published = data?.profile?.theme;
    if (published?.colors) {
      applyTheme(published.name, published.custom ? published.colors : null, false);
      return;
    }
    try { const saved = JSON.parse(localStorage.getItem('lucian-vex-theme') || 'null'); if (saved?.colors) applyTheme(saved.name, saved.custom ? saved.colors : null, false); else applyTheme('vex-noir', null, false); } catch (_) { applyTheme('vex-noir', null, false); }
  }

  const WALLPAPER_MODES = {
    cyberflow: { name: 'Cyber Flow', sub: 'Neon particles, glass streaks and drifting glow' },
    aurora: { name: 'Neon Aurora', sub: 'Deep atmospheric pink / violet motion' },
    scanline: { name: 'System Scan', sub: 'Cyber grid + scanning light bars' },
    nexus: { name: 'Violet Nexus', sub: 'Slow moving energy nodes and beams' },
    none: { name: 'Static', sub: 'No animated wallpaper' }
  };

  function wallpaperSettings() {
    if (!data.profile.liveWallpaper && data.profile.discordProfile?.liveWallpaper) data.profile.liveWallpaper = clone(data.profile.discordProfile.liveWallpaper);
    data.profile.liveWallpaper ||= { mode: 'cyberflow', imageUrl: '', videoUrl: '', opacity: 0.32, blur: 0, tint: 0.14 };
    const w = data.profile.liveWallpaper;
    w.mode ||= 'cyberflow'; w.imageUrl ||= ''; w.videoUrl ||= '';
    w.opacity = Math.min(.72, Math.max(0, Number(w.opacity ?? .32)));
    w.blur = Math.min(18, Math.max(0, Number(w.blur ?? 0)));
    w.tint = Math.min(.45, Math.max(0, Number(w.tint ?? .14)));
    return w;
  }

  function compressWallpaperImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1920, maxH = 1080;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .80));
        };
        img.onerror = reject;
        img.src = String(reader.result || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function applyLiveWallpaper() {
    const layer = $('#live-wallpaper-layer'); const video = $('#live-wallpaper-video'); if (!layer) return;
    const w = wallpaperSettings();
    layer.dataset.mode=w.mode; layer.style.setProperty('--wallpaper-opacity',String(w.opacity)); layer.style.setProperty('--wallpaper-blur',`${w.blur}px`); layer.style.setProperty('--wallpaper-tint',String(w.tint));
    const image=String(w.imageUrl||'').trim(); layer.style.backgroundImage=image ? `url("${image.replace(/"/g,'\"')}")` : '';
    layer.classList.toggle('has-custom-image',!!image); layer.classList.toggle('disabled',w.mode==='none'); layer.setAttribute('aria-hidden','true');
    if(video){
      const src=String(w.videoUrl||'').trim(); const useVideo=!!src && w.mode==='video';
      if(useVideo){ if(video.dataset.loadedSrc!==src){video.dataset.loadedSrc=src; video.src=src; video.load();} video.style.display='block'; const playPromise=video.play(); if(playPromise?.catch) playPromise.catch(()=>{}); }
      else { video.pause(); video.removeAttribute('src'); video.removeAttribute('data-loaded-src'); video.style.display='none'; }
    }
  }

  function openThemeManager() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('lucian-vex-theme') || 'null'); } catch (_) { return null; } })();
    const active = saved?.name || 'vex-noir';
    const c = saved?.colors || THEMES['vex-noir'];
    const w = wallpaperSettings();
    const wallpaperOwner = ownerMode ? '' : ' locked';

    openModal(`
      <div class="theme-manager">
        <div class="theme-manager-head">
          <div>
            <p class="eyebrow">VISUAL CONTROL // LUCIAN VEX</p>
            <h2 id="modal-title">Theme Manager</h2>
            <p class="theme-manager-sub">Shape the atmosphere, palette and background without touching the rest of the site.</p>
          </div>
          <div class="theme-live-indicator"><i></i><span id="theme-live-label">LIVE PREVIEW</span></div>
        </div>

        <div class="theme-tabs" role="tablist" aria-label="Theme settings">
          <button class="theme-tab active" data-theme-tab="appearance" type="button" role="tab">APPEARANCE</button>
          <button class="theme-tab" data-theme-tab="wallpaper" type="button" role="tab">WALLPAPER${wallpaperOwner}</button>
        </div>

        <section class="theme-panel active" data-theme-panel="appearance">
          <div class="theme-section-head"><div><span class="mini-label">01 // PRESETS</span><h3>Choose a visual system</h3></div><span class="theme-count">${Object.keys(THEMES).length} PRESETS</span></div>
          <div class="theme-preset-grid">
            ${Object.entries(THEMES).map(([key,t]) => `
              <button class="theme-preset ${active===key?'active':''}" type="button" data-theme-preset="${key}">
                <span class="preset-preview" style="--p-bg:${t.bg};--p-panel:${t.panel};--p-pink:${t.pink};--p-purple:${t.purple}"><i></i><b></b><em></em></span>
                <span class="preset-copy"><strong>${t.name}</strong><small>${t.sub}</small></span>
                <span class="preset-check">${active===key?'✓':''}</span>
              </button>`).join('')}
          </div>

          <div class="theme-section-head custom-head"><div><span class="mini-label">02 // CUSTOM PALETTE</span><h3>Your own color system</h3></div><button class="section-toggle" data-toggle-section="palette" type="button">EDIT</button></div>
          <div class="theme-collapsible" data-collapsible="palette">
            <p class="muted-note">Fine-tune the core colors. The site automatically derives the secondary shades and borders.</p>
            <div class="palette-grid">
              ${[['Background','theme-bg',c.bg],['Panel','theme-panel',c.panel],['Pink','theme-pink',c.pink],['Purple','theme-purple',c.purple],['White','theme-white',c.white],['Muted','theme-muted',c.muted]].map(([label,id,val]) => `<label class="palette-item"><span><b>${label}</b><small>${val.toUpperCase()}</small></span><input id="${id}" type="color" value="${val}"></label>`).join('')}
            </div>
            <button class="btn primary form-submit" id="save-custom-theme" type="button">SAVE CUSTOM PALETTE</button>
          </div>
        </section>

        <section class="theme-panel" data-theme-panel="wallpaper">
          <div class="theme-section-head"><div><span class="mini-label">01 // BACKGROUND</span><h3>Live wallpaper studio</h3></div><span class="theme-count">${ownerMode ? 'OWNER' : 'LOCKED'}</span></div>
          ${ownerMode ? `
          <div class="wallpaper-stage">
            <div class="wallpaper-stage-copy"><span class="stage-kicker">CURRENT BACKDROP</span><strong id="wallpaper-stage-title">${WALLPAPER_MODES[w.mode]?.name || 'Custom Live Video'}</strong><small id="wallpaper-stage-sub">${WALLPAPER_MODES[w.mode]?.sub || 'Your uploaded live wallpaper'}</small></div>
            <div class="wallpaper-stage-glow"></div>
          </div>
          <div class="wallpaper-mode-grid">
            ${Object.entries(WALLPAPER_MODES).map(([key,t]) => `<button class="wallpaper-mode ${w.mode===key?'active':''}" type="button" data-wallpaper-mode="${key}"><span class="mode-icon">${key==='none'?'□':key==='cyberflow'?'✦':key==='aurora'?'≈':key==='scanline'?'▤':'◈'}</span><span><strong>${t.name}</strong><small>${t.sub}</small></span></button>`).join('')}
            <button class="wallpaper-mode ${w.mode==='video'?'active':''}" type="button" data-wallpaper-mode="video"><span class="mode-icon">▶</span><span><strong>Custom Live Video</strong><small>MP4 / WebM or hosted video</small></span></button>
          </div>

          <div class="wallpaper-upload-cards">
            <label class="upload-card"><span class="upload-icon">▣</span><span><strong>Background Image</strong><small>PNG / JPG / WebP · auto optimized</small></span><input id="wallpaper-image-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <label class="upload-card"><span class="upload-icon">▶</span><span><strong>Live Wallpaper</strong><small>MP4 / WebM · keep it lightweight</small></span><input id="wallpaper-video-file" type="file" accept="video/mp4,video/webm"></label>
          </div>

          <div class="wallpaper-links">
            <div class="form-field"><label>IMAGE URL / PATH</label><input id="wallpaper-image-url" value="${esc((w.imageUrl || '').startsWith('data:') ? '' : w.imageUrl)}" placeholder="https://.../background.jpg"></div>
            <div class="form-field"><label>VIDEO URL / PATH</label><input id="wallpaper-video-url" value="${esc((w.videoUrl || '').startsWith('data:') ? '' : w.videoUrl)}" placeholder="https://.../wallpaper.webm"></div>
          </div>

          <div class="wallpaper-controls">
            <label class="range-card"><span><b>INTENSITY</b><output id="wallpaper-opacity-value">${Math.round(w.opacity*100)}%</output></span><input id="wallpaper-opacity" type="range" min="0" max="0.72" step="0.01" value="${w.opacity}"></label>
            <label class="range-card"><span><b>BLUR</b><output id="wallpaper-blur-value">${w.blur}px</output></span><input id="wallpaper-blur" type="range" min="0" max="18" step="1" value="${w.blur}"></label>
            <label class="range-card wide"><span><b>CONTENT DIMMER</b><output id="wallpaper-tint-value">${Math.round(w.tint*100)}%</output></span><input id="wallpaper-tint" type="range" min="0" max="0.45" step="0.01" value="${w.tint}"></label>
          </div>
          <p class="muted-note theme-footnote">Live preview updates instantly. Export the site after saving to make your selected wallpaper part of the published build.</p>
          <button class="btn primary form-submit" id="save-wallpaper" type="button">SAVE WALLPAPER SYSTEM</button>
          ` : `<div class="locked-wallpaper"><div class="locked-orb">⌁</div><strong>OWNER CONTROL</strong><p>Wallpaper selection is available only after Owner Mode is unlocked.</p><span>CTRL + SHIFT + L</span></div>`}
        </section>
      </div>
    `);
    applyOwnerVisibility();

    $$('.theme-tab').forEach(btn => btn.addEventListener('click', () => {
      const key=btn.dataset.themeTab;
      $$('.theme-tab').forEach(x=>x.classList.toggle('active',x===btn));
      $$('.theme-panel').forEach(x=>x.classList.toggle('active',x.dataset.themePanel===key));
      if (key==='wallpaper' && !ownerMode) $('#theme-live-label') && ($('#theme-live-label').textContent='LOCKED');
    }));

    $$('.theme-preset').forEach(btn => btn.addEventListener('click', async () => {
      applyTheme(btn.dataset.themePreset);
      $$('.theme-preset').forEach(x=>x.classList.toggle('active',x===btn));
      $$('.preset-check').forEach(x=>x.textContent='');
      btn.querySelector('.preset-check').textContent='✓';
      if (ownerMode) await persist('Theme saved'); else showToast(`${THEMES[btn.dataset.themePreset].name} applied locally`);
    }));

    $$('[data-toggle-section]').forEach(btn => btn.addEventListener('click', () => {
      const target=document.querySelector(`[data-collapsible="${btn.dataset.toggleSection}"]`);
      const open=target?.classList.toggle('open'); if(target) btn.textContent=open?'CLOSE':'EDIT';
    }));

    const previewWallpaper=(refreshStage=true)=>{
      if(!ownerMode) return;
      const ww=wallpaperSettings();
      ww.opacity=Number($('#wallpaper-opacity')?.value ?? ww.opacity);
      ww.blur=Number($('#wallpaper-blur')?.value ?? ww.blur);
      ww.tint=Number($('#wallpaper-tint')?.value ?? ww.tint);
      $$('#nav a').forEach(link => { try { const path=new URL(link.href,location.href).pathname.split('/').pop()||'index.html'; link.classList.toggle('active',path===location.pathname.split('/').pop() || (PAGE==='home'&&path==='index.html')); } catch(_){} });
  applyLiveWallpaper();
      if(refreshStage){
        const info=WALLPAPER_MODES[ww.mode];
        if($('#wallpaper-stage-title')) $('#wallpaper-stage-title').textContent=ww.mode==='video'?'Custom Live Video':(info?.name||'Custom Background');
        if($('#wallpaper-stage-sub')) $('#wallpaper-stage-sub').textContent=ww.mode==='video'?'Your uploaded live wallpaper':(info?.sub||'Your custom backdrop');
      }
      if($('#wallpaper-opacity-value')) $('#wallpaper-opacity-value').textContent = `${Math.round(ww.opacity*100)}%`;
      if($('#wallpaper-blur-value')) $('#wallpaper-blur-value').textContent = `${ww.blur}px`;
      if($('#wallpaper-tint-value')) $('#wallpaper-tint-value').textContent = `${Math.round(ww.tint*100)}%`;
    };

    $('#wallpaper-image-file')?.addEventListener('change', async e => {
      const file=e.target.files?.[0]; if(!file) return;
      if(file.size>8*1024*1024) return showToast('Background image is too large — keep it under 8 MB');
      try { wallpaperSettings().imageUrl=await compressWallpaperImage(file); showToast('Background image attached'); previewWallpaper(); } catch(err){ showToast('Could not read background image'); console.error(err); }
    });
    $('#wallpaper-video-file')?.addEventListener('change', e => {
      const file=e.target.files?.[0]; if(!file) return;
      if(file.size>6*1024*1024) return showToast('Live wallpaper video is too large — keep it under 6 MB');
      fileToDataURL(file, value => { wallpaperSettings().videoUrl=value; wallpaperSettings().mode='video'; previewWallpaper(); $$('.wallpaper-mode').forEach(x=>x.classList.toggle('active',x.dataset.wallpaperMode==='video')); showToast('Live wallpaper attached'); });
    });
    $$('.wallpaper-mode').forEach(btn => btn.addEventListener('click', () => { const ww=wallpaperSettings(); ww.mode=btn.dataset.wallpaperMode; $$('.wallpaper-mode').forEach(x=>x.classList.toggle('active',x===btn)); previewWallpaper(); }));
    ['wallpaper-opacity','wallpaper-blur','wallpaper-tint'].forEach(id => $(`#${id}`)?.addEventListener('input', () => previewWallpaper(false)));
    $('#save-wallpaper')?.addEventListener('click', () => {
      const ww=wallpaperSettings();
      const imageInput=$('#wallpaper-image-url')?.value.trim(); const videoInput=$('#wallpaper-video-url')?.value.trim();
      if (imageInput) ww.imageUrl=imageInput; else if (!String(ww.imageUrl).startsWith('data:')) ww.imageUrl='';
      if (videoInput) ww.videoUrl=videoInput;
      ww.opacity=Number($('#wallpaper-opacity').value); ww.blur=Number($('#wallpaper-blur').value); ww.tint=Number($('#wallpaper-tint').value);
      if (ww.videoUrl && (ww.mode==='video' || !ww.imageUrl)) ww.mode='video';
      applyLiveWallpaper(); persist('Wallpaper system saved'); closeModal();
    });

    $('#save-custom-theme')?.addEventListener('click', async () => {
      const custom = {...THEMES['vex-noir'], name:'Custom', sub:'Your saved palette', bg:$('#theme-bg').value, panel:$('#theme-panel').value, pink:$('#theme-pink').value, purple:$('#theme-purple').value, white:$('#theme-white').value, muted:$('#theme-muted').value};
      custom.bg2 = mixHex(custom.bg, '#ffffff', .06); custom.panel2 = mixHex(custom.panel, '#ffffff', .05); custom.pink2 = mixHex(custom.pink, '#ffffff', .25); custom.purple2 = mixHex(custom.purple, '#ffffff', .3); custom.line = mixHex(custom.panel, '#ffffff', .12);
      applyTheme('custom', custom); if (ownerMode) await persist('Custom theme saved'); else showToast('Custom palette saved locally'); closeModal();
    });
  }

  function mixHex(a,b,weight){const p=h=>{const x=h.replace('#','');return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]};const A=p(a),B=p(b);const r=A.map((v,i)=>Math.round(v+(B[i]-v)*weight));return '#'+r.map(v=>v.toString(16).padStart(2,'0')).join('');}


  function openArchiveDetails(type, index) {
    const arr=type==='game'?data.games:data.anime; const item=arr[index]; if(!item) return;
    const cats=itemCategories(type,item); const title=type==='game'?item.title:item.title;
    const categoryHtml=cats.length?cats.map(id=>`<span class="tag">${esc(categoryLabel(id))}</span>`).join(''):'<span class="tag">UNCATEGORIZED</span>';
    if(type==='game'){
      const achievements=Array.isArray(item.achievements)?item.achievements:[];
      openModal(`<p class="eyebrow">GAME // ARCHIVE DETAILS</p><h2 id="modal-title">${esc(title)}</h2><div class="detail-layout"><div class="detail-cover"><img src="${esc(item.poster||'')}" alt="${esc(title)}"></div><div class="detail-copy"><div class="category-tags">${categoryHtml}</div><div class="detail-grid"><div><span>STATUS</span><strong>${esc(item.status||'NOT SET')}</strong></div><div><span>PROGRESS</span><strong>${clamp(item.progress,0,100)}%</strong></div><div><span>RANK</span><strong>${esc(item.rank||'—')}</strong></div><div><span>MY RATING</span><strong>${item.rating===''||item.rating==null?'NOT RATED':`${Number(item.rating).toFixed(1)}/10`}</strong></div></div><p>${esc(item.goal||'No personal note yet.')}</p>${achievements.length?`<div class="detail-list"><span class="eyebrow">ACHIEVEMENTS</span>${achievements.map((a,n)=>`<div><b>0${n+1}</b>${esc(a)}</div>`).join('')}</div>`:''}${item.steamUrl?`<a class="btn ghost" href="${esc(item.steamUrl)}" target="_blank" rel="noopener noreferrer">OPEN STEAM ↗</a>`:''}${ownerMode?`<button class="btn primary" data-edit="game" data-i="${index}" type="button">EDIT GAME</button>`:''}</div></div>`);
    } else {
      openModal(`<p class="eyebrow">ANIME // ARCHIVE DETAILS</p><h2 id="modal-title">${esc(title)}</h2><div class="detail-layout"><div class="detail-cover"><img src="${esc(item.poster||'')}" alt="${esc(title)}"></div><div class="detail-copy"><div class="category-tags">${categoryHtml}</div><div class="detail-grid"><div><span>STATUS</span><strong>${esc(item.status||'PLANNING')}</strong></div><div><span>EPISODES</span><strong>${item.episode||0}/${item.totalEpisodes||'?'}</strong></div><div><span>RATING</span><strong>${item.score===''||item.score==null?'NOT RATED':`${esc(item.score)}/10`}</strong></div><div><span>FAVORITE</span><strong>${item.favorite?'YES':'NO'}</strong></div></div><p>${esc(item.notes||'No personal note yet.')}</p>${item.anilistId?`<a class="btn ghost" href="https://anilist.co/anime/${encodeURIComponent(item.anilistId)}" target="_blank" rel="noopener noreferrer">OPEN ANILIST ↗</a>`:''}${ownerMode?`<button class="btn primary" data-edit="anime" data-i="${index}" type="button">EDIT ANIME</button>`:''}</div></div>`);
    }
    applyOwnerVisibility();
  }

  function openGlobalSearch() {
    openModal(`<p class="eyebrow">LUCIAN VEX // GLOBAL SEARCH</p><h2 id="modal-title">Search the archive</h2><p class="muted-note">Search Games, Anime, Skills and Connections from one place.</p><div class="search-row"><input id="global-search-input" placeholder="Search anything..." autocomplete="off"><button class="btn primary" id="global-search-run" type="button">SEARCH</button></div><div id="global-search-results" class="search-results"></div>`);
    const run=()=>{
      const q=$('#global-search-input').value.trim().toLowerCase(); const results=[];
      if(!q) return $('#global-search-results').innerHTML='<div class="empty">Type something to search.</div>';
      data.games.forEach((x,i)=>{const hay=[x.title,x.status,x.type,x.goal,(x.achievements||[]).join(' '),itemCategories('game',x).join(' ')].join(' ').toLowerCase(); if(hay.includes(q)) results.push({type:'GAME',title:x.title,sub:x.status,index:i,page:'gaming.html'});});
      data.anime.forEach((x,i)=>{const hay=[x.title,x.status,x.notes,itemCategories('anime',x).join(' ')].join(' ').toLowerCase(); if(hay.includes(q)) results.push({type:'ANIME',title:x.title,sub:x.status,index:i,page:'anime.html'});});
      data.skills.forEach((x,i)=>{if([x.name,x.desc].join(' ').toLowerCase().includes(q)) results.push({type:'SKILL',title:x.name,sub:x.desc,index:i,page:'skills.html'});});
      data.links.forEach((x,i)=>{if([x.name,x.role,x.url].join(' ').toLowerCase().includes(q)) results.push({type:'LINK',title:x.name,sub:x.role,index:i,page:'network.html'});});
      $('#global-search-results').innerHTML=results.length?results.slice(0,50).map(r=>`<button class="search-result search-result-button" data-deeplink="${r.page}#${r.type.toLowerCase()}-${r.index}" type="button"><div><strong>${esc(r.title)}</strong><small>${esc(r.type)} • ${esc(r.sub||'')}</small></div><span>OPEN ↗</span></button>`).join(''):'<div class="empty">No matches found.</div>';
    };
    $('#global-search-run')?.addEventListener('click',run); $('#global-search-input')?.addEventListener('input',run); $('#global-search-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  }

  function handleDeepLink() {
    const hash=location.hash.replace(/^#/,''); const m=hash.match(/^(game|anime|skill|link)-(\d+)$/); if(!m) return;
    const typeMap={game:'game',anime:'anime'};
    if(typeMap[m[1]]) openArchiveDetails(typeMap[m[1]],Number(m[2]));
    else document.getElementById(hash)?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function toggleFavorite(type, index) {
    if (type === 'anime') {
      const item=data.anime[index]; if(!item) return;
      item.favorite=!item.favorite;
      item.categories=itemCategories('anime',item).filter(id=>id!=='favorite');
      if(item.favorite)item.categories.push('favorite');
      item.updatedAt=new Date().toISOString();
      persist(item.favorite?'Added to favorites':'Removed from favorites');
      return;
    }
    if (type === 'game') {
      const item=data.games[index]; if(!item) return;
      const hadFavorite=itemCategories('game',item).includes('favorite');
      const cats=itemCategories('game',item).filter(id=>id!=='favorite');
      item.categories=hadFavorite ? (cats.length?cats:['rotation']) : ['favorite',...(cats.length?cats:['rotation'])];
      item.category=item.categories.find(id=>id!=='favorite') || item.categories[0] || 'rotation';
      item.updatedAt=new Date().toISOString();
      persist(hadFavorite?'Removed from game favorites':'Added to game favorites');
    }
  }

  let revealObserver = null;

  function setupReveal() {
    const elements = $$('.reveal, .panel, .card, .discord-card, .contact-box').filter(el => !el.dataset.revealBound);
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => { el.classList.add('is-visible'); el.dataset.revealBound = '1'; });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }), { threshold: .08, rootMargin: '0px 0px -40px 0px' });
    }
    elements.forEach((el, index) => {
      el.dataset.revealBound = '1';
      el.style.setProperty('--reveal-delay', `${Math.min(index * 45, 300)}ms`);
      revealObserver.observe(el);
    });
  }

  function setupCursor() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const core = $('#cursor-core'), ring = $('#cursor-ring'), trail = $('#cursor-trail');
    if (!core || !ring || !trail) return;
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    const move = e => { x = e.clientX; y = e.clientY; core.style.transform = `translate3d(${x}px,${y}px,0)`; trail.style.transform = `translate3d(${x}px,${y}px,0)`; document.body.classList.add('cursor-active'); };
    const tick = () => { rx += (x - rx) * .18; ry += (y - ry) * .18; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; requestAnimationFrame(tick); };
    addEventListener('mousemove', move, { passive:true });
    addEventListener('mouseleave', () => document.body.classList.remove('cursor-active'));
    document.addEventListener('mouseover', e => { if (e.target.closest('a,button,.card,.panel,.discord-card,.filter')) document.body.classList.add('cursor-hover'); });
    document.addEventListener('mouseout', e => { if (e.target.closest('a,button,.card,.panel,.discord-card,.filter')) document.body.classList.remove('cursor-hover'); });
    tick();
  }

  function exportData() {
    if (!ownerMode) return showToast('Owner mode is locked');
    const source = `window.LUCIAN_DATA = ${JSON.stringify(data, null, 2)};\n`;
    const blob = new Blob([source], {type:'application/javascript'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'data.js'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('data.js exported — publish it with your site host');
  }

  applyOwnerVisibility();
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      ownerMode ? lockOwner() : unlockOwner();
    }
  });

  $('#modal-close')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

  document.addEventListener('click', event => {
    const card = event.target.closest('.link-card[data-href]');
    if(card && !event.target.closest('button,a')){const url=card.dataset.href;if(url)window.open(url,'_blank','noopener,noreferrer');return;}
    const add=event.target.closest('[data-open]'); if(add){if(!ownerMode)return showToast('Owner mode is locked');openManager(add.dataset.open,-1);return;}
    const edit=event.target.closest('[data-edit]'); if(edit){if(!ownerMode)return showToast('Owner mode is locked');openManager(edit.dataset.edit,Number(edit.dataset.i));return;}
    const del=event.target.closest('[data-del]'); if(del){if(!ownerMode)return showToast('Owner mode is locked');const type=del.dataset.del,index=Number(del.dataset.i),arr=getArray(type);if(confirm('Delete this item?')){arr.splice(index,1);persist('Deleted');}return;}
    const save=event.target.closest('[data-save-manager]'); if(save){if(!ownerMode)return showToast('Owner mode is locked');saveManager(save.dataset.saveManager,Number(save.dataset.index));return;}
    const addAni=event.target.closest('[data-add-anilist]'); if(addAni){if(!ownerMode)return showToast('Owner mode is locked');addFromAniList(addAni.dataset.addAnilist);return;}
    const addSteam=event.target.closest('[data-add-steam]'); if(addSteam){if(!ownerMode)return showToast('Owner mode is locked');addFromSteam(addSteam.dataset.addSteam);return;}
    const categoryFilter=event.target.closest('[data-category-filter]'); if(categoryFilter){const isGame=!!categoryFilter.closest('.game-toolbar');const id=categoryFilter.dataset.categoryFilter||'all';if(isGame){gameFilter=id;gameVisibleLimit=GAME_PAGE_SIZE;renderGames();}else{animeFilter=id;animeVisibleLimit=ANIME_PAGE_SIZE;renderAnime();}return;}
    const favAnime=event.target.closest('[data-fav="anime"]'); if(favAnime){if(!ownerMode)return showToast('Owner mode is locked');toggleFavorite('anime',Number(favAnime.dataset.i));return;}
    const favGame=event.target.closest('[data-fav="game"]'); if(favGame){if(!ownerMode)return showToast('Owner mode is locked');toggleFavorite('game',Number(favGame.dataset.i));return;}
    const details=event.target.closest('[data-details]'); if(details){openArchiveDetails(details.dataset.details,Number(details.dataset.i));return;}
    const more=event.target.closest('[data-load-more]'); if(more){if(more.dataset.loadMore==='game'){gameVisibleLimit+=GAME_PAGE_SIZE;renderGames();}else{animeVisibleLimit+=ANIME_PAGE_SIZE;renderAnime();}return;}
    const deep=event.target.closest('[data-deeplink]'); if(deep){location.href=deep.dataset.deeplink.includes('.html')?deep.dataset.deeplink:deep.dataset.deeplink;return;}
  });

  $('#global-search-btn')?.addEventListener('click',openGlobalSearch);
  $('#anilist-search-open')?.addEventListener('click', aniSearch);
  $('#theme-btn')?.addEventListener('click', openThemeManager);
  $('#export-btn')?.addEventListener('click', exportData);
  $('#discord-setup')?.addEventListener('click', openDiscordSetup);

  $('#steam-search-open')?.addEventListener('click', steamSearch);
  $('#category-system-open')?.addEventListener('click', openCategoryManager);

  $('#menu-btn')?.addEventListener('click', () => $('#nav')?.classList.toggle('open'));
  $('#game-page-search')?.addEventListener('input', e => { gameSearchQuery=e.target.value.trim().toLowerCase(); gameVisibleLimit=GAME_PAGE_SIZE; renderGames(); });
  $('#anime-page-search')?.addEventListener('input', e => { animeSearchQuery=e.target.value.trim().toLowerCase(); animeVisibleLimit=ANIME_PAGE_SIZE; renderAnime(); });
  $('#theme-page-open')?.addEventListener('click', openThemeManager);
  applyLiveWallpaper();
  $$('#nav a').forEach(link => link.addEventListener('click', () => $('#nav')?.classList.remove('open')));

  // Paint immediately from bundled/cache data. Cloud reconciliation happens in the background.
  loadTheme();
  renderAll();
  renderDiscordProfile();
  setTimeout(handleDeepLink, 60);
  applyOwnerVisibility();
  setupReveal();

  (async () => {
    if (cloudEnabled) {
      await loadOwnerSession();
      const published = await loadPublishedData();
      data = published;
      window.LUCIAN_DATA = clone(published);
      if (cloudSession && !cloudOwner) { await supabaseClient.auth.signOut(); cloudSession = null; }
      loadTheme();
      renderAll();
      supabaseClient.channel('lucian-vex-site-data').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lucian_site_data', filter: 'id=eq.1' }, payload => {
        if (!ownerMode) {
          data = normalizeData(payload.new?.data || data);
          window.LUCIAN_DATA = clone(data);
          try { localStorage.setItem(PUBLISHED_CACHE_KEY, JSON.stringify(data)); } catch (_) {}
          loadTheme();
          renderAll();
          showToast('Site updated');
        }
      }).subscribe();
    } else {
      data = normalizeData(saved || cachedPublished || window.LUCIAN_DATA || {});
      window.LUCIAN_DATA = clone(data);
      loadTheme();
      renderAll();
    }
  })();
  setupCursor();
})();
