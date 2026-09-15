exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const term = String(params.term || '').trim();
  const appid = String(params.appid || '').trim();
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, stale-while-revalidate=600' };
  const reply = (body, status = 200) => ({ statusCode: status, headers, body: JSON.stringify(body) });

  const fetchText = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 LucianVexGameArchive/1.0', 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  };
  const fetchJson = async (url) => {
    const text = await fetchText(url);
    return JSON.parse(text);
  };

  const cleanHtml = (value) => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
  const normalizeItems = (items) => (Array.isArray(items) ? items : []).map(item => {
    const id = item.id || item.appid || item.steam_appid || item.steamAppID || '';
    const name = item.name || item.title || item.external || '';
    const image = item.header_image || item.large_capsule_image || item.tiny_image || item.thumb || item.logo || '';
    return {
      ...item,
      id: id ? Number(id) : '',
      appid: id ? Number(id) : '',
      steam_appid: id ? Number(id) : '',
      name,
      header_image: item.header_image || (id ? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg` : image),
      tiny_image: item.tiny_image || image
    };
  }).filter(item => item.name && item.id);

  try {
    if (appid) {
      try {
        const json = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&cc=us&l=english`);
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
        }, provider: 'Steam App Details' });
      } catch (error) {
        return reply({ game: null, error: `Steam app details failed: ${error.message}` }, 502);
      }
    }

    if (!term) return reply({ error: 'Missing search term' }, 400);

    // 1) Steam's JSON search endpoint.
    try {
      const json = await fetchJson(`https://store.steampowered.com/search/results/?term=${encodeURIComponent(term)}&count=50&ignore_preferences=1&category1=998&cc=us&l=english&json=1`);
      const items = normalizeItems(json?.items);
      if (items.length) return reply({ items: items.slice(0, 20), provider: 'Steam Store JSON' });
    } catch (error) {
      console.warn('Steam JSON search failed:', error.message);
    }

    // 2) Steam normal HTML search page. This avoids relying on Steam's JSON endpoint.
    try {
      const html = await fetchText(`https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&count=50&ignore_preferences=1&category1=998&cc=us&l=english`);
      const items = [];
      const rowRe = /<a[^>]+class="[^"]*search_result_row[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
      let match;
      while ((match = rowRe.exec(html)) && items.length < 20) {
        const row = match[0];
        const idMatch = row.match(/data-ds-appid="([^"]+)"/i) || row.match(/data-ds-itemkey="App_(\d+)"/i);
        const titleMatch = row.match(/<span class="title">([\s\S]*?)<\/span>/i);
        const imgMatch = row.match(/<(?:img)[^>]+(?:src|data-webp)="([^"]+)"/i);
        if (!idMatch || !titleMatch) continue;
        const id = Number(idMatch[1]);
        if (!id) continue;
        items.push({ id, appid:id, steam_appid:id, name:cleanHtml(titleMatch[1]), tiny_image:imgMatch?.[1] || '', header_image:`https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg` });
      }
      if (items.length) return reply({ items, provider: 'Steam Store HTML' });
    } catch (error) {
      console.warn('Steam HTML search failed:', error.message);
    }

    // 3) CheapShark fallback. It is public/no-key and commonly exposes a Steam app id.
    try {
      const json = await fetchJson(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(term)}&limit=20`);
      const items = normalizeItems((json || []).map(item => ({
        id: item.steamAppID || '',
        name: item.external,
        thumb: item.thumb,
        steamAppID: item.steamAppID
      })).filter(item => item.id));
      if (items.length) return reply({ items, provider: 'CheapShark (Steam)' });
    } catch (error) {
      console.warn('CheapShark fallback failed:', error.message);
    }

    return reply({ items: [], provider: 'None', searchUrl: `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&ignore_preferences=1`, alternateUrl: `https://www.cheapshark.com/search?search=${encodeURIComponent(term)}` });
  } catch (error) {
    console.error('Game search function error:', error);
    return reply({ error: 'Game search failed' }, 502);
  }
};
