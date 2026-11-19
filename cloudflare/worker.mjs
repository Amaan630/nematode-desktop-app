// One hibernating hub carries wake-up notifications; D1 remains the source of truth.
export class LiveHub {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [request.headers.get('X-Client-ID')]);
      server.send('sync'); // catches anything stored before the connection was established
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'nematode' } });
    }
    const ids = await request.json();
    const sockets = ids ? ids.flatMap(id => this.ctx.getWebSockets(id)) : this.ctx.getWebSockets();
    for (const socket of new Set(sockets)) {
      try { socket.send('sync'); } catch { socket.close(); }
    }
    return new Response(null, { status: 204 });
  }

  webSocketMessage(socket) { socket.close(1008, 'Unexpected message'); }
  webSocketClose(socket, code) { socket.close(code === 1000 ? 1000 : 1001); }
  webSocketError(socket) { socket.close(); }
}
const hub = env => env.LIVE.get(env.LIVE.idFromName('buddies'));
async function notify(env, ids = null) {
  const response = await hub(env).fetch('https://live/notify', { method: 'POST', body: JSON.stringify(ids) });
  if (!response.ok) throw new Error('Live notification failed');
}

// The first other installation is the recipient. Keep this policy in one place.
export async function resolveRecipient(db, sender, requested = null) {
  const peer = requested
    ? await db.prepare('SELECT id, character, appearance FROM clients WHERE id = ? AND id != ?').bind(requested, sender).first()
    : await db.prepare('SELECT id, character, appearance FROM clients WHERE id != ? ORDER BY sequence LIMIT 1').bind(sender).first();
  return peer && { ...peer, appearance: savedAppearance(peer) };
}

const schema = [
  `CREATE TABLE IF NOT EXISTS clients (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    secret_hash TEXT NOT NULL, character TEXT NOT NULL, appearance TEXT)`,
  `CREATE TABLE IF NOT EXISTS actions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    sender TEXT NOT NULL REFERENCES clients(id), recipient TEXT NOT NULL REFERENCES clients(id),
    pair TEXT NOT NULL, action TEXT NOT NULL, character TEXT NOT NULL, appearance TEXT, acknowledged INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS inbox ON actions(recipient, acknowledged, sequence)',
  "CREATE INDEX IF NOT EXISTS relationship ON actions(pair, sequence DESC) WHERE action IN ('together','separate')",
];
const initialized = new WeakMap();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const character = value => typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value);
const pairKey = (a, b) => [a, b].sort().join(':');
const supported = new Set(['heart', 'love', 'together', 'separate']);
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const json = (body, status = 200) => Response.json(body, { status, headers });
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
// Transport the whole appearance. The server validates data, not the catalog of wearable items.
function canonical(value, depth = 0) {
  if (depth > 4) fail(400, 'Appearance too deeply nested');
  if (Array.isArray(value)) return value.map(v => canonical(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k], depth + 1)]));
  return value;
}
function appearance(data) {
  const value = data?.appearance ?? { character: data?.character, accessories: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value) || !character(value.character)
      || (data.character != null && data.character !== value.character)) fail(400, 'Invalid appearance');
  const accessories = value.accessories ?? {};
  if (typeof accessories !== 'object' || Array.isArray(accessories)
      || Object.entries(accessories).some(([slot, item]) => !character(slot) || !character(item))) fail(400, 'Invalid accessories');
  const encoded = JSON.stringify(canonical({ ...value, accessories }));
  if (encoded.length > 2048) fail(400, 'Appearance too large');
  return encoded;
}
function savedAppearance(row) {
  return row.appearance ? JSON.parse(row.appearance) : { character: row.character, accessories: {} };
}
function sameAppearance(row, encoded) { return JSON.stringify(canonical(savedAppearance(row))) === encoded; }
async function body(request) {
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); fail(413, 'Request too large'); }
    chunks.push(value);
  }
  const text = await new Blob(chunks).text();
  try { const value = JSON.parse(text); if (!value || Array.isArray(value) || typeof value !== 'object') throw 0; return value; }
  catch { fail(400, 'Invalid JSON'); }
}
async function hash(secret) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    try {
      const url = new URL(request.url), db = env.DB;
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
      if (Number(request.headers.get('content-length')) > 8192) fail(413, 'Request too large');
      const live = url.pathname === '/live' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
      const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(s => s.trim()) || [];
      const device = live && protocols.includes('nematode') && protocols.find(p => p.startsWith('device.'));
      const credential = device ? `Bearer ${device.slice(7).replace('.', ':')}` : request.headers.get('authorization');
      const auth = credential?.match(/^Bearer ([^:]+):([0-9a-f]{64})$/);
      if (!auth || !uuid(auth[1])) fail(401, 'Invalid device credential');
      const [, id, secret] = auth, secretHash = await hash(secret);
      if (!initialized.has(db)) {
        initialized.set(db, db.batch(schema.map(sql => db.prepare(sql))).catch(e => { initialized.delete(db); throw e; }));
      }
      await initialized.get(db);
      if (request.method === 'POST' && url.pathname === '/register') {
        const data = await body(request);
        const look = appearance(data), characterId = JSON.parse(look).character;
        // Idempotent registration survives a lost response without creating a second user.
        await db.prepare('INSERT INTO clients(id, secret_hash, character, appearance) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(id, secretHash, characterId, look).run();
        const owner = await db.prepare('SELECT secret_hash, character FROM clients WHERE id = ?').bind(id).first();
        if (owner.secret_hash !== secretHash) fail(401, 'Invalid device credential');
        await db.prepare('UPDATE clients SET character = ?, appearance = ? WHERE id = ? AND (character != ? OR appearance IS NULL OR appearance != ?)').bind(characterId, look, id, characterId, look).run();
        await notify(env); // registration also wakes senders waiting for their first recipient
        return json({ id });
      }
      const owner = await db.prepare('SELECT secret_hash FROM clients WHERE id = ?').bind(id).first();
      if (!owner || owner.secret_hash !== secretHash) fail(401, 'Invalid device credential');
      if (live) return hub(env).fetch(new Request('https://live/connect', { headers: { Upgrade: 'websocket', 'X-Client-ID': id } }));
      if (request.method === 'POST' && url.pathname === '/actions') {
        const data = await body(request);
        const look = appearance(data.payload), characterId = JSON.parse(look).character;
        if (!uuid(data.id) || !supported.has(data.action)
            || (data.to != null && !uuid(data.to))) fail(400, 'Invalid action');
        const existing = await db.prepare('SELECT * FROM actions WHERE id = ?').bind(data.id).first();
        if (existing) {
          if (existing.sender !== id || existing.action !== data.action || !sameAppearance(existing, look)
              || (data.to != null && existing.recipient !== data.to)) fail(409, 'Action ID already used');
          await notify(env, [id, existing.recipient]);
          return json({ id: data.id, to: existing.recipient });
        }
        const peer = await resolveRecipient(db, id, data.to);
        if (!peer) fail(409, 'No recipient yet');
        await db.prepare('INSERT INTO actions(id, sender, recipient, pair, action, character, appearance) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(data.id, id, peer.id, pairKey(id, peer.id), data.action, characterId, look).run();
        const stored = await db.prepare('SELECT sender, recipient, action, character, appearance FROM actions WHERE id = ?').bind(data.id).first();
        if (stored.sender !== id || stored.action !== data.action || !sameAppearance(stored, look)
            || stored.recipient !== peer.id) fail(409, 'Action ID already used');
        await notify(env, [id, peer.id]);
        return json({ id: data.id, to: peer.id });
      }
      if (request.method === 'GET' && url.pathname === '/sync') {
        const peer = await resolveRecipient(db, id);
        const events = await db.prepare("SELECT id, sender AS 'from', recipient AS 'to', action, character, appearance FROM actions WHERE recipient = ? AND acknowledged = 0 AND action IN ('heart','love') ORDER BY sequence LIMIT 50")
          .bind(id).all();
        const state = peer && await db.prepare("SELECT sequence, action FROM actions WHERE pair = ? AND action IN ('together','separate') ORDER BY sequence DESC LIMIT 1")
          .bind(pairKey(id, peer.id)).first();
        return json({ peer, events: events.results.map(({ character, appearance, ...event }) => ({ ...event, payload: { character, appearance: savedAppearance({ character, appearance }) } })),
          together: { version: state?.sequence || 0, active: state?.action === 'together', peer } });
      }
      if (request.method === 'POST' && url.pathname === '/ack') {
        const data = await body(request);
        if (!Array.isArray(data.ids) || data.ids.length > 50 || !data.ids.every(uuid)) fail(400, 'Invalid receipts');
        if (data.ids.length) await db.batch(data.ids.map(eventId => db.prepare('UPDATE actions SET acknowledged = 1 WHERE id = ? AND recipient = ?').bind(eventId, id)));
        return json({ ok: true });
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      if (!e.status) console.error('Request failed', e.message);
      return json({ error: e.status ? e.message : 'Service unavailable' }, e.status || 503);
    }
  },
};
