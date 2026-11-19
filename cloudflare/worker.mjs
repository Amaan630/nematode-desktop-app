// The first other installation is the recipient. Keep this policy in one place.
export async function resolveRecipient(db, sender, requested = null) {
  return requested
    ? db.prepare('SELECT id, character FROM clients WHERE id = ? AND id != ?').bind(requested, sender).first()
    : db.prepare('SELECT id, character FROM clients WHERE id != ? ORDER BY sequence LIMIT 1').bind(sender).first();
}

const schema = [
  `CREATE TABLE IF NOT EXISTS clients (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    secret_hash TEXT NOT NULL, character TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS actions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    sender TEXT NOT NULL REFERENCES clients(id), recipient TEXT NOT NULL REFERENCES clients(id),
    pair TEXT NOT NULL, action TEXT NOT NULL, character TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0)`,
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
      const auth = request.headers.get('authorization')?.match(/^Bearer ([^:]+):([0-9a-f]{64})$/);
      if (!auth || !uuid(auth[1])) fail(401, 'Invalid device credential');
      const [, id, secret] = auth, secretHash = await hash(secret);
      if (!initialized.has(db)) {
        initialized.set(db, db.batch(schema.map(sql => db.prepare(sql))).catch(e => { initialized.delete(db); throw e; }));
      }
      await initialized.get(db);
      if (request.method === 'POST' && url.pathname === '/register') {
        const data = await body(request);
        if (!character(data.character)) fail(400, 'Invalid character');
        // Idempotent registration survives a lost response without creating a second user.
        await db.prepare('INSERT INTO clients(id, secret_hash, character) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(id, secretHash, data.character).run();
        const owner = await db.prepare('SELECT secret_hash FROM clients WHERE id = ?').bind(id).first();
        if (owner.secret_hash !== secretHash) fail(401, 'Invalid device credential');
        await db.prepare('UPDATE clients SET character = ? WHERE id = ? AND character != ?').bind(data.character, id, data.character).run();
        return json({ id });
      }
      const owner = await db.prepare('SELECT secret_hash FROM clients WHERE id = ?').bind(id).first();
      if (!owner || owner.secret_hash !== secretHash) fail(401, 'Invalid device credential');
      if (request.method === 'POST' && url.pathname === '/actions') {
        const data = await body(request);
        if (!uuid(data.id) || !supported.has(data.action) || !character(data.payload?.character)
            || (data.to != null && !uuid(data.to))) fail(400, 'Invalid action');
        const existing = await db.prepare('SELECT * FROM actions WHERE id = ?').bind(data.id).first();
        if (existing) {
          if (existing.sender !== id || existing.action !== data.action || existing.character !== data.payload.character
              || (data.to != null && existing.recipient !== data.to)) fail(409, 'Action ID already used');
          return json({ id: data.id, to: existing.recipient });
        }
        const peer = await resolveRecipient(db, id, data.to);
        if (!peer) fail(409, 'No recipient yet');
        await db.prepare('INSERT INTO actions(id, sender, recipient, pair, action, character) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(data.id, id, peer.id, pairKey(id, peer.id), data.action, data.payload.character).run();
        const stored = await db.prepare('SELECT sender, recipient, action, character FROM actions WHERE id = ?').bind(data.id).first();
        if (stored.sender !== id || stored.action !== data.action || stored.character !== data.payload.character
            || stored.recipient !== peer.id) fail(409, 'Action ID already used');
        return json({ id: data.id, to: peer.id });
      }
      if (request.method === 'GET' && url.pathname === '/sync') {
        const peer = await resolveRecipient(db, id);
        const events = await db.prepare("SELECT id, sender AS 'from', recipient AS 'to', action, character FROM actions WHERE recipient = ? AND acknowledged = 0 AND action IN ('heart','love') ORDER BY sequence LIMIT 50")
          .bind(id).all();
        const state = peer && await db.prepare("SELECT sequence, action FROM actions WHERE pair = ? AND action IN ('together','separate') ORDER BY sequence DESC LIMIT 1")
          .bind(pairKey(id, peer.id)).first();
        return json({ peer, events: events.results.map(({ character, ...event }) => ({ ...event, payload: { character } })),
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
