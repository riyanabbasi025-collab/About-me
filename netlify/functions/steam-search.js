exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const term = String(params.term || '').trim();
  const appid = String(params.appid || '').trim();
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' };
  const reply = (body, status = 200, extraHeaders = {}) => ({ statusCode: status, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
  const getJson = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36', 'Accept': 'application/json,text/plain,*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  };
  const normalizeItems = (items) => (Array.isArray(items) ? items : []).map(item => {
    const logo = item.logo || item.tiny_image || item.large_capsule_image || item.header_image || '';
    const match = String(logo).match(/\/apps\/(\d+)\//);
    const id = item.id || item.appid || item.steam_appid || (match ? match[1] : '');
    return { ...item, id: id ? Number(id) : '', appid: id ? Number(id) : '', header_image: item.header_image || (id ? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg` : logo), tiny_image: item.tiny_image || logo, logo };
  }).filter(item => item.name && item.id && String(item.type || 'app').toLowerCase() === 'app');

  try {
    if (appid) {
      const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&cc=us&l=english`;
      let json;
      try { json = await getJson(url); } catch (error) { return reply({ error: `Steam app details failed: ${error.message}` }, 502); }
      const detail = json?.[appid]?.success ? json[appid].data : null;
      if (!detail) return reply({ game: null });
      return reply({ game: {
        id: detail.steam_appid,
        name: detail.name,
        header_image: detail.header_image,
        short_description: detail.short_description,
        genres: detail.genres || [],
        price: detail.price_overview ? { final_formatted: detail.price_overview.final_formatted || '' } : {},
        steam_appid: detail.steam_appid
      }});
    }

    if (!term) return reply({ error: 'Missing search term' }, 400);
    // Endpoint 1: public Steam store-search JSON (supports 50 results).
    try {
      const url = `https://store.steampowered.com/search/results/?term=${encodeURIComponent(term)}&count=50&ignore_preferences=1&category1=998&cc=us&l=english&json=1`;
      const json = await getJson(url);
      const items = normalizeItems(json?.items);
      if (items.length) return reply({ items, provider: 'Steam Store Search' });
    } catch (primaryError) {
      console.warn('Steam search/results failed:', primaryError);
    }

    // Endpoint 2: older storesearch endpoint as a fallback.
    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=english`;
      const json = await getJson(url);
      const items = normalizeItems(json?.items);
      if (items.length) return reply({ items, provider: 'Steam Store API' });
    } catch (fallbackError) {
      console.warn('Steam storesearch failed:', fallbackError);
    }

    return reply({ items: [], provider: 'Steam', searchUrl: `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&ignore_preferences=1` });
  } catch (error) {
    console.error('Steam function error:', error);
    return reply({ error: 'Steam request failed' }, 502);
  }
};
