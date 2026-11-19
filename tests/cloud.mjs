import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../cloudflare/worker.mjs';

// Exercise real SQLite statements and transactions; the same tests can target wrangler via BACKEND_TEST_URL.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
const db = {
  prepare(sql) {

    return {
      args: [], bind(...args) { this.args = args; return this; },
      async first() { return sqlite.prepare(sql).get(...this.args) || null; },
      async all() { return {results: sqlite.prepare(sql).all(...this.args)}; },
      async run() { return sqlite.prepare(sql).run(...this.args); },
    };
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
const env = {DB:db, LIVE:{idFromName:name=>name, get:()=>({fetch:async()=>new Response(null,{status:204})})}}, endpoint = process.env.BACKEND_TEST_URL || 'https://test.invalid';
if (process.env.BACKEND_TEST_URL) assert(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname), 'Use a disposable local backend');
const request = process.env.BACKEND_TEST_URL ? fetch : (url, options) => worker.fetch(new Request(url, options), env);
const CloudConnection = vm.runInNewContext(readFileSync(new URL('../src/connection.js', import.meta.url), 'utf8') + ';CloudConnection', {
  crypto, AbortSignal, console, setTimeout, clearTimeout, globalThis,
});
const memory = () => {const data = new Map(); return {getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v)}};
const stores = [memory(), memory(), memory()];
let offline = false, dropResponse = false, awake = true, ready = true;
const played = [], shared = [];
const options = (storage, character) => ({ storage, character: () => character, isActive: async () => awake, canPlay: () => ready,
  fetch: async (...args) => {
    if (offline) throw new Error('offline');
    const response = await request(...args);
    if (dropResponse && args[0].endsWith('/actions')) {dropResponse = false; throw new Error('lost response')}
    return response;
  },
  onGesture: (event, done) => {played.push({event, done});}, onState: state => shared.push(state),
});
const alice = new CloudConnection(endpoint, options(stores[0], 'nematode'));
const auth = c => ({Authorization:`Bearer ${c.state.id}:${c.state.secret}`, 'Content-Type':'application/json'});
const event = (c, action, to = null) => ({id:crypto.randomUUID(),from:c.state.id,to,action,payload:{character:c.character()}});
const drain = async c => {while(c.running) await new Promise(resolve=>setTimeout(resolve,1));};
const send = async (c,e) => {await c.send(e); await drain(c);};
await alice.cycle();
assert.equal(alice.peer, null);
const first = event(alice,'heart');
await send(alice,first); // nobody else has registered: retain it for later
assert.equal(alice.state.outbox.length,1);
const bob = new CloudConnection(endpoint,options(stores[1],'croissant'));
await bob.cycle(); await alice.cycle();
assert.equal(alice.state.outbox.length,0);
assert.equal(alice.peer.id,bob.state.id);
awake = false; await bob.cycle();
assert.equal(bob.state.inbox.length,1); assert.equal(played.length,0);
// Quit/reopen while inactive: same identity, same pending gesture, no setup.
const reopened = new CloudConnection(endpoint, options(stores[1],'croissant'));
assert.equal(reopened.state.id,bob.state.id); await reopened.cycle(); assert.equal(played.length,0);
awake = true; await reopened.cycle();
assert.equal(played.length,1); assert.equal(played[0].event.payload.character,'nematode');
await reopened.cycle(); assert.equal(played.length,1); // no replay while animating
ready = false; await played[0].done(); await reopened.cycle(); ready = true; // opening the fan must not replay an already seen visit
assert.equal(reopened.state.inbox.length,0); assert.equal(reopened.state.receipts.length,0);
const again = new CloudConnection(endpoint,options(stores[1],'croissant'));
await again.cycle(); assert.equal(played.length,1); // acknowledgement survives restart
// Sender offline and restarted: pending action eventually arrives.
offline = true; await send(alice,event(alice,'love'));
assert.equal(alice.state.outbox.length,1);
const resumedAlice = new CloudConnection(endpoint,options(stores[0],'nematode'));
offline = false; await resumedAlice.cycle(); await again.cycle();
assert.equal(played.at(-1).event.action,'love'); await played.at(-1).done(); await again.cycle();
// A lost POST response retries the same ID, without a duplicate incoming visit.
const retry = event(resumedAlice,'heart'); dropResponse = true; await send(resumedAlice,retry);
assert.equal(resumedAlice.state.outbox.length,1); await resumedAlice.cycle();
const before = played.length; await again.cycle();
assert.equal(played.length,before+1); assert.equal(played.at(-1).event.id,retry.id);
await played.at(-1).done(); await again.cycle();
// Latest shared state wins, even when the recipient missed both transitions.
await send(resumedAlice,event(resumedAlice,'together')); await send(resumedAlice,event(resumedAlice,'separate'));
await again.cycle(); assert.equal(again.state.together.active,false);
await send(resumedAlice,event(resumedAlice,'together')); await again.cycle();
assert.equal(again.state.together.active,true); assert.equal(again.state.together.peer.character,'nematode');
const version = again.state.together.version;
await send(resumedAlice,retry); await again.cycle(); assert.equal(again.state.together.version,version);
// Third installation follows the documented first-other policy; explicit addressing remains supported.
const third = new CloudConnection(endpoint,options(stores[2],'nematode')); await third.cycle();
assert.equal(third.peer.id,alice.state.id);
await send(third,event(third,'love',bob.state.id));
await again.cycle(); assert.equal(played.at(-1).event.from,third.state.id);
await played.at(-1).done(); await again.cycle();
// Authentication, ownership, input validation, and no secret exposure.
let response = await request(endpoint+'/sync',{headers:{Authorization:`Bearer ${bob.state.id}:${'0'.repeat(64)}`}});
assert.equal(response.status,401);
response = await request(endpoint+'/register',{method:'POST',headers:{Authorization:`Bearer ${bob.state.id}:${'0'.repeat(64)}`},body:JSON.stringify({character:'nematode'})});
assert.equal(response.status,401);
response = await request(endpoint+'/actions',{method:'POST',headers:auth(third),body:JSON.stringify({...retry,from:third.state.id})});
assert.equal(response.status,409);
response = await request(endpoint+'/actions',{method:'POST',headers:auth(third),body:JSON.stringify({...event(third,'heart'),payload:{character:'<script>'}})});
assert.equal(response.status,400);
const notYours = event(resumedAlice,'heart'); await send(resumedAlice,notYours);
await request(endpoint+'/ack',{method:'POST',headers:auth(third),body:JSON.stringify({ids:[notYours.id]})});
response = await request(endpoint+'/sync',{headers:auth(again)});
const sync = await response.json(); assert(sync.events.some(e=>e.id===notYours.id));
assert(!JSON.stringify(sync).includes(resumedAlice.state.secret));
// No successful write when local persistence fails.
const brokenStorage = {getItem: stores[0].getItem, setItem:()=>{throw new Error('disk full')}};
const broken = new CloudConnection(endpoint,options(brokenStorage,'nematode'));
const length = broken.state.outbox.length;
await assert.rejects(broken.send(event(broken,'heart')),/disk full/); assert.equal(broken.state.outbox.length,length);
console.log('Passed: auto-registration, first-other routing, inactive/restarted receiver, offline sender, lost-response dedupe, acknowledgements, latest shared state, explicit addressing and auth boundaries.');
sqlite.close();
