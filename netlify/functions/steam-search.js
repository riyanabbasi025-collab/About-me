exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const term = String(params.term || '').trim();
  const appid = String(params.appid || '').trim();
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' };
  const reply = (body, status = 200) => ({ statusCode: status, headers, body: JSON.stringify(body) });

  try {
    if (appid) {
      const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&cc=us&l=english`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Lucian-Vex-Archive/1.0' } });
      if (!res.ok) return reply({ error: `Steam returned ${res.status}` }, 502);
      const json = await res.json();
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
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=english`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Lucian-Vex-Archive/1.0' } });
    if (!res.ok) return reply({ error: `Steam returned ${res.status}` }, 502);
    const json = await res.json();
    return reply({ items: Array.isArray(json?.items) ? json.items : [] });
  } catch (error) {
    console.error('Steam function error:', error);
    return reply({ error: 'Steam request failed' }, 502);
  }
};
