export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/sync\/([^/]+)$/);
    if (!match) return json({ error: 'Not found' }, 404);

    const userId = decodeURIComponent(match[1]);
    const token = request.headers.get('x-sync-token') || '';
    if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const key = `snapshot:${userId}`;

    if (request.method === 'GET') {
      const raw = await env.CARDEX_SYNC.get(key);
      if (!raw) return json({ error: 'No snapshot' }, 404);
      return new Response(raw, { headers: { 'content-type': 'application/json' } });
    }

    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.cards)) return json({ error: 'Invalid payload' }, 400);

      const incoming = {
        cards: body.cards,
        updatedAt: body.updatedAt || new Date().toISOString(),
        deviceId: body.deviceId || 'unknown',
      };

      const currentRaw = await env.CARDEX_SYNC.get(key);
      if (currentRaw) {
        const current = JSON.parse(currentRaw);
        if (Date.parse(current.updatedAt || 0) > Date.parse(incoming.updatedAt || 0)) {
          return json(current, 409);
        }
      }

      await env.CARDEX_SYNC.put(key, JSON.stringify(incoming));
      return json(incoming, 200);
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
