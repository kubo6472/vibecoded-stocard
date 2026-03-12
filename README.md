# Cardex

Cardex is a single-file, offline-first loyalty wallet.

## Added persistence/sync proposal (Cloudflare Workers)

The app now supports **optional cloud snapshot sync** on top of local `localStorage` persistence.

### What is implemented in the app

- Local-first writes are still immediate (`localStorage` remains source of truth on device).
- New **Cloud sync** settings section lets you:
  - configure Worker URL + vault/user id + sync token,
  - push local cards to cloud,
  - pull cloud cards to the device,
  - toggle auto-sync after local changes.
- Conflict handling is simple and predictable:
  - each snapshot carries `updatedAt`,
  - pull warns before replacing local data if local timestamp appears newer,
  - worker accepts last-write-wins by timestamp.

## Cloudflare Worker backend

Create `workers/cardex-sync-worker.js` and deploy with Wrangler.

```js
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
          return json(current, 409); // existing snapshot is newer
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
```

### Example Wrangler setup

```toml
name = "cardex-sync"
main = "workers/cardex-sync-worker.js"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "CARDEX_SYNC"
id = "<prod-kv-id>"
preview_id = "<preview-kv-id>"
```

Set worker secret:

```bash
wrangler secret put SYNC_TOKEN
```

Deploy:

```bash
wrangler deploy
```

Then configure Cardex settings with:

- Worker URL: `https://cardex-sync.<subdomain>.workers.dev`
- Vault/user id: any shared id you use across devices
- Sync token: same value used for `SYNC_TOKEN`

## Notes / future improvements

- Current design is snapshot sync (simple and robust for small card sets).
- To support true multi-device merge semantics, evolve to per-card CRDT/version vectors.
- For stronger auth, replace static token with Cloudflare Access/JWT or per-user signed tokens.
