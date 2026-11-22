// Real WebSockets against a disposable local Cloudflare runtime, never production users.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const endpoint = process.env.BACKEND_TEST_URL || 'http://127.0.0.1:8789';
assert(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname));
const CloudConnection = vm.runInNewContext(readFileSync(new URL('../src/connection.js', import.meta.url), 'utf8') + ';CloudConnection', {
  crypto, AbortSignal, console, setTimeout, clearTimeout, globalThis,
});
const memory = () => { const data = new Map(); return { getItem:k=>data.get(k), setItem:(k,v)=>data.set(k,v) }; };
const wait = async condition => {
  for (let i = 0; i < 200; i++) { if (await condition()) return; await new Promise(r=>setTimeout(r,50)); }
  throw new Error('Timed out waiting for live delivery');
};
const updates = [];
const requests = [], played = [], stores = [memory(),memory()];
let active = true, offline = false, aliceCharacter = 'nematode', aliceHat = 'cap';
const options = (storage, character) => ({ storage, character, isActive:async()=>active,
  fetch:async (...args)=>{ requests.push(args[0]); if(offline) throw new Error('offline'); return fetch(...args); },
  onGesture:(event,done)=>played.push({event,done}), onState:()=>{}, onUpdate:version=>updates.push(version),
});
const alice = new CloudConnection(endpoint, {...options(stores[0],()=>aliceCharacter),appearance:()=>({character:aliceCharacter,accessories:{hat:aliceHat}})});
let bob = new CloudConnection(endpoint, options(stores[1],()=> 'croissant'));
const event = action => ({id:crypto.randomUUID(),from:alice.state.id,to:bob.state.id,action,payload:{character:alice.character(),appearance:alice.appearance()}});
try {
  alice.start(); bob.start();
  await wait(()=>alice.socket?.readyState===1 && bob.socket?.readyState===1 && alice.peer && bob.peer);
  await new Promise(r=>setTimeout(r,1500));
  const quiet = requests.length;
  await new Promise(r=>setTimeout(r,6500));
  assert.equal(requests.length,quiet,'idle sockets make no HTTP polling requests');
  // Heartbeat receives an automatic pong without a sync request.
  alice.lastPing = Date.now()-31000;
  await alice.tick();
  await wait(()=>alice.lastPong>=alice.lastPing);
  assert.equal(requests.length,quiet);
  const heart = event('heart');
  await alice.send(heart);
  await wait(()=>played.some(p=>p.event.id===heart.id));
  assert.equal(played.at(-1).event.payload.character,'nematode');
  assert.equal(played.at(-1).event.payload.appearance.accessories.hat,'cap');
  await played.at(-1).done();
  await wait(()=>bob.state.receipts.length===0 && !bob.running);
  // Reconnect the same identity and collect a gesture sent while the receiver was quit.
  bob.stop(); const id = bob.state.id;
  const love = event('love'); await alice.send(love);
  await wait(()=>!alice.state.outbox.length);
  bob = new CloudConnection(endpoint, options(stores[1],()=> 'croissant')); bob.start();
  assert.equal(bob.state.id,id);
  await wait(()=>played.some(p=>p.event.id===love.id));
  await played.at(-1).done();
  await wait(()=>bob.state.receipts.length===0 && !bob.running);
  // Inactive users keep downloaded gestures without polling; returning triggers local playback.
  active=false; const asleep = event('heart'); await alice.send(asleep);
  await wait(()=>bob.state.inbox.some(e=>e.id===asleep.id));
  assert(!played.some(p=>p.event.id===asleep.id));
  active=true; await wait(()=>played.some(p=>p.event.id===asleep.id));
  await played.at(-1).done();
  await alice.send(event('together')); await wait(()=>bob.state.together.active);
  aliceHat='sunhat'; await wait(()=>bob.state.together.peer.appearance.accessories.hat==='sunhat');
  const picnic=event('scene'); picnic.payload.state={mode:'picnic',future:{cozy:true}};
  await alice.send(picnic); await wait(()=>bob.state.together.scene?.mode==='picnic');
  assert.equal(bob.state.together.scene.future.cozy,true);
  await alice.send(event('separate')); await wait(()=>!bob.state.together.active);
  aliceCharacter='croissant'; await wait(()=>bob.peer?.character==='croissant');
  // A stale connection after sleep is replaced, then sync catches any missed notifications.
  const socket = bob.socket;
  bob.lastPong = Date.now()-61000;
  await bob.tick();
  await wait(()=>bob.socket!==socket && bob.socket?.readyState===1);
  // Local outgoing persistence survives a failed request and retries after recovery.
  offline=true; const pending=event('love'); await alice.send(pending);
  await wait(()=>!alice.running); assert(alice.state.outbox.some(e=>e.id===pending.id));
  offline=false; await wait(()=>played.some(p=>p.event.id===pending.id));
  await played.at(-1).done();
  // Invalid credentials cannot establish a live connection, even for an existing device ID.
  const bad = new WebSocket(endpoint.replace(/^http/,'ws')+'/live',['nematode',`device.${id}.${'0'.repeat(64)}`]);
  let rejected=false; bad.onerror=()=>{rejected=true;};
  await wait(()=>rejected); bad.close();
  assert.equal(played.filter(p=>p.event.id===heart.id).length,1);
  // The local hook verifies the real published manifest, but only notifies these disposable clients.
  if (process.env.TEST_RELEASE_VERSION) {
    bob.stop();
    const version=process.env.TEST_RELEASE_VERSION, count=updates.length;
    const response=await fetch(endpoint+'/release',{method:'POST',headers:{Authorization:'Bearer local-release-test','Content-Type':'application/json'},body:JSON.stringify({version})});
    assert.equal(response.status,200,await response.text());
    await wait(()=>updates.length>count && updates.includes(version));
    const liveCount=updates.length;
    bob=new CloudConnection(endpoint,options(stores[1],()=> 'croissant')); bob.start();
    await wait(()=>updates.length>liveCount);
    assert.equal(updates.at(-1),version,'offline receiver learns the release on reconnect');
  }
  console.log('Passed: idle without polling, heartbeat, live gestures/state/profile, offline catch-up, activity gating, stale-socket reconnect, retry, and socket authentication.');
} finally { alice.stop(); bob.stop(); }
