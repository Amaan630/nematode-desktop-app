// Browser checks without a test dependency. CHROME can point at another Chromium executable.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'nematode-test-'));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank']);
const pending = new Map();
let socket, sequence = 0;
try {
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    chrome.on('error', reject);
    chrome.on('exit', code => reject(new Error(`Chrome exited: ${code}`)));
    chrome.stderr.on('data', b => {
      const match = b.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const origin = address.replace(/^ws:/, 'http:').split('/devtools')[0];
  const pages = await (await fetch(`${origin}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data), waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    response.error ? waiter.reject(new Error(response.error.message)) : waiter.resolve(response.result);
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function run(expression) {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame = () => 0;' });
  await call('Page.navigate', { url: pathToFileURL(resolve('src/index.html')).href + '?demo' });
  for (let i = 0; i < 100 && !await run('typeof fan !== "undefined"'); i++) await new Promise(r => setTimeout(r, 30));
  await run(`document.fonts.load('14px "Lilita One"')`);
  await run(`
    window.step = seconds => { for (let i = 0; i < seconds * 60; i++) tick(last + 1000 / 60); };
    Object.assign(n, {x: 450, y: 550, state: 'idle', t: 0, home: 450, nextWander: 100});
    want.mode = 'free'; want.floor = 550; step(.1);
    window.check = (condition, message) => { if (!condition) throw new Error(message); };
    window.openFan = () => cv.dispatchEvent(new MouseEvent('contextmenu', {clientX: n.x, clientY: n.y - 30, bubbles: true, cancelable: true}));
    window.pick = label => [...fan.element.querySelectorAll('[role=menuitem]')].find(b => b.getAttribute('aria-label') === label).dispatchEvent(new MouseEvent('click', {bubbles:true}));
    openFan(); check(fan.open, 'right-click opens fan');
    check(fan.element.querySelectorAll('[role=menuitem]').length === 3, 'three actions');
    check(press === null, 'right-click must not grab');
    const stillX = n.x; step(1); check(n.x === stillX, 'menu pauses movement');
    check(fan.element.offsetWidth === 256, 'compact fan');
    check(!fan.element.querySelector('filter') && fan.element.querySelector('.segment').getAttribute('d').includes('C'), 'continuous hand-drawn outlines without displacement');
    check(document.fonts.check('14px "Lilita One"'), 'bundled font loaded');
    check(fan.element.querySelectorAll('animateTransform').length === 2, 'fan springs with vector transforms');
    check(getComputedStyle(fan.element.querySelector('svg')).transform === 'none', 'no CSS bitmap scaling');
    fan.element.querySelector('svg').pauseAnimations();
    fan.element.querySelector('svg').setCurrentTime(.12);
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-fan-spring.png', Buffer.from(r.data, 'base64')));
  await run(`
    fan.element.querySelector('svg').setCurrentTime(.46);
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-fan.png', Buffer.from(r.data, 'base64')));
  const fanBounds = await run(`(() => {
    window.savedChoose = fan.choose; window.chosen = [];
    fan.choose = id => chosen.push(id);
    check(getComputedStyle(fan.element).userSelect === 'none', 'fan text cannot be selected');
    const r = fan.element.getBoundingClientRect(); return {x:r.left, y:r.top};
  })()`);
  const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent', {
    type, x:fanBounds.x + x, y:fanBounds.y + y, button:type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount:1,
  });
  await mouse('mousePressed', 53, 92, 1);
  await mouse('mouseMoved', 128, 49, 1);
  await run(`check(fan.element.querySelector('.active')?.getAttribute('aria-label') === 'Send I love you', 'drag transfers active segment');`);
  await call('Page.captureScreenshot', {format:'png'}).then(r => writeFile('/private/tmp/nematode-fan-drag.png', Buffer.from(r.data, 'base64')));
  await mouse('mouseReleased', 128, 49);
  await run(`check(chosen.length === 1 && chosen[0] === 'love', 'release chooses only the destination'); openFan(); fan.element.querySelector('svg').setCurrentTime(1);`);
  await mouse('mousePressed', 53, 92, 1);
  await mouse('mouseMoved', 280, 140, 1);
  await mouse('mouseReleased', 280, 140);
  await run(`check(chosen.length === 1 && fan.open, 'release outside cancels selection'); fan.choose = savedChoose;`);
  await run(`
    pick('Send a heart'); check(!fan.open && hearts.length === 1 && hearts[0].colors === GOLD_HEART_COLORS, 'gold send action');
    heart(); check(hearts[1].colors === HEART_COLORS, 'ordinary click heart stays pink');
    openFan(); pick('Send I love you'); check(words[0].text === 'I love you', 'love message'); step(.45);
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-speech.png', Buffer.from(r.data, 'base64')));
  await run(`
    openFan(); pick('Be together'); check(together.active, 'join starts'); step(.35);
    check(together.guest.x < 0, 'rope casts before visitor enters');
    step(2); check(together.guest.x > 0, 'visitor arrives');
    openFan(); check(fan.element.textContent.includes('Separate'), 'separate replaces join'); fan.hide();
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-together.png', Buffer.from(r.data, 'base64')));
  await run(`
    openFan(); pick('Separate'); step(4); check(!together.active && !together.guest, 'visitor leaves');
    Object.assign(n, {x: 30, y: 70, state:'idle'}); step(.02); openFan();
    const bounds = fan.element.getBoundingClientRect();
    check(bounds.left >= 0 && bounds.top >= n.y && bounds.right <= innerWidth, 'top-left menu stays onscreen');
    fan.element.querySelector('[role=menuitem]').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    check(!fan.open, 'escape closes');
    check(!fan.element.hidden && fan.element.inert, 'closing stays visible without accepting input');
    openFan(); check(fan.open && !fan.element.inert, 'reopen cancels closing'); fan.hide();
    openFan(); cv.dispatchEvent(new PointerEvent('pointerdown', {button:0, clientX:700, clientY:300, bubbles:true}));
    check(!fan.open && !press, 'outside click closes without grabbing');
    setCharacter('croissant'); Object.assign(n, {x:850, y:550, state:'idle'}); step(.02); openFan();
    check(fan.element.getBoundingClientRect().right <= innerWidth, 'right-edge menu stays onscreen');
    pick('Be together'); step(3); check(together.guest.character === CHARACTERS.nematode, 'other character works');
    openFan(); nema({mode:'away'}); check(!fan.open, 'dismiss closes menu'); step(12); check(n.state === 'gone', 'dismiss still leaves');
    check(Number.isFinite(n.x) && Number.isFinite(n.y), 'finite physics');
  `);
  await run(`
    together.separate(); step(1);
    setCharacter('croissant');
    Object.assign(n, {x:450, y:550, state:'idle', t:0, home:450, nextWander:100});
    want.mode = 'free';
    buddy.receive({id:'gift', from:'alice', to:buddy.id, action:'heart', payload:{character:'nematode'}});
    check(delivery.active, 'incoming heart queues a visit');
    for (let i = 0; i < 1200 && delivery.guest?.state !== 'give'; i++) step(1/60);
    check(delivery.guest?.state === 'give', 'sender arrives');
    check(delivery.guest.character === CHARACTERS.nematode && character() === CHARACTERS.croissant, 'sender character is preserved');
    check(hearts.length === 1 && hearts[0].colors === GOLD_HEART_COLORS, 'visitor gives one gold heart');
    step(.45);
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-delivery.png', Buffer.from(r.data, 'base64')));
  await run(`
    step(15); check(!delivery.active && hearts.length === 0, 'sender leaves after giving');
    nema({mode:'away'}); step(15); check(n.state === 'gone', 'receiver dismissed');
    buddy.receive({id:'gift-away', from:'alice', to:buddy.id, action:'heart', payload:{character:'nematode'}});
    check(want.mode === 'away' && n.state !== 'gone', 'temporary summon preserves dismissed preference');
    step(30); check(!delivery.active && n.state === 'gone', 'both leave after temporary delivery');
    buddy.receive({id:'invalid', from:'alice', to:buddy.id, action:'heart', payload:{character:'missing'}});
    check(!delivery.active, 'unknown sender character rejected');
    buddy.receive({id:'invalid', from:'alice', to:buddy.id, action:'unknown', payload:{character:'nematode'}});
    check(!delivery.active, 'unknown action rejected');
  `);
  await run(`
    buddy.receive({id:'love-preview', from:'alice', to:buddy.id, action:'love', payload:{character:'nematode'}});
    for (let i=0; i<1800 && !words.length; i++) step(1/60);
    check(words.length === 1 && words[0].text === 'I love you', 'received love plays its bubble');
    check(delivery.guest.character === CHARACTERS.nematode, 'love uses sender character');
    step(30); check(!delivery.active && n.state === 'gone', 'love visitor and temporary resident leave');
    nema({mode:'free', floor:550});
    buddy.receive({id:'together-preview', from:'alice', to:buddy.id, action:'together', payload:{character:'croissant'}});
    check(together.active && together.guest.waiting, 'incoming together waits for resident');
    check(together.guest.character.jiggle !== CHARACTERS.croissant.jiggle, 'same-character visitor has independent springs');
    step(15); check(!together.guest.waiting && together.guest.t > 2 && together.guest.x > 0, 'incoming together arrives with rope');
    openFan(); check(fan.element.textContent.includes('Separate'), 'received together offers separation');
    pick('Separate'); step(15); check(!together.guest && !together.active, 'received together can separate');
  `);
  await run(`
    setCharacter('nematode'); previewReceive('heart');
    check(delivery.queue[0].character === CHARACTERS.croissant, 'debug uses Croissant for Nematode');
    delivery.queue.length = 0;
    setCharacter('croissant'); previewReceive('love');
    check(delivery.queue[0].character === CHARACTERS.nematode, 'debug uses Nematode for Croissant');
    delivery.queue.length = 0;
    Object.assign(n, {x:450, y:550, state:'idle', t:0, home:450, nextWander:100, cursor:null});
    previewReceive('together'); step(3);
    const ownerX = n.x, guestX = together.guest.x, random = Math.random;
    try {
      Math.random = () => .9; n.t = 10; n.nextWander = 0; step(1);
      check(n.x > ownerX + 10 && together.guest.x > guestX + 10, 'both characters wander while together');
    } finally { Math.random = random; }
    together.separate(); step(10);
    const positions = [], translate = ctx.translate.bind(ctx);
    ctx.translate = (x,y) => {positions.push(y); translate(x,y)};
    try {
      drawSpeech(ctx, 'I love you', 450, 400, .6); const first = positions[0]; positions.length = 0;
      drawSpeech(ctx, 'I love you', 450, 400, 3.4);
      check(positions[0] < first - 100, 'speech floats upward before disappearing');
      positions.length = 0; drawSpeech(ctx, 'I love you', 450, 400, 3.4, true);
      check(positions[0] === first, 'reduced motion keeps speech stationary');
    } finally { ctx.translate = translate; }
    Object.assign(n, {x:450, y:550, state:'idle', t:0, home:450, nextWander:100});
    words = []; say('I love you'); step(2.8);
  `);
  await call('Page.captureScreenshot', { format: 'png' }).then(r => writeFile('/private/tmp/nematode-speech-floating.png', Buffer.from(r.data, 'base64')));
  await call('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion', value:'reduce'}] });
  await run(`
    Object.assign(n, {x:450, y:550, state:'idle'}); want.mode='free'; step(.02); openFan();
    check(fan.element.querySelectorAll('animateTransform').length === 0, 'reduced motion skips spring'); fan.hide();
  `);
  assert.equal(await run(`(async () => {
    const sent = [], client = new BuddyClient('alice', {send: async e => sent.push(e)});
    const result = await client.send('bob', 'heart', {character:'nematode'});
    check(result.status === 'sent' && sent[0].to === 'bob' && sent[0].from === 'alice', 'addressed transport');
    let received = 0; client.addEventListener('action', () => received++);
    check(!client.receive(sent[0]) && received === 0, 'wrong recipient rejected');
    check(client.receive({...sent[0], to:'alice'}) && received === 1, 'matching recipient delivered');
    check(!client.receive({to:'alice'}), 'malformed envelope rejected');
    const preview = await buddy.send('bob', 'heart'); check(preview.status === 'preview', 'stub does not claim delivery');
    const broken = new BuddyClient('alice', {send: async () => {throw new Error('offline')}});
    let failed = false; try { await broken.send('bob', 'heart'); } catch {failed = true;}
    check(failed, 'delivery errors reach caller'); return true;
  })()`), true);
  if (process.env.BACKEND_TEST_URL) {
    const backend = new URL(process.env.BACKEND_TEST_URL);
    assert(['localhost', '127.0.0.1'].includes(backend.hostname), 'Use a disposable local backend');
    await run(`(async () => {
      delivery.queue.length = 0; delivery.guest = null; together.separate(); step(10);
      Object.assign(n, {x:450,y:550,state:'idle',home:450,nextWander:100,cursor:null}); want.mode='free';
      const storage = () => {const map=new Map(); return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}};
      window.liveReceiver = new CloudConnection(${JSON.stringify(backend.origin)}, {
        storage:storage(), character:()=> 'croissant', isActive:async()=>true, onGesture:receiveGesture, onState:()=>{},
      });
      const sender = new CloudConnection(${JSON.stringify(backend.origin)}, {
        storage:storage(), character:()=> 'nematode', isActive:async()=>false, onGesture:()=>{}, onState:()=>{},
      });
      liveReceiver.start(); await sender.cycle();
      for(let i=0;i<200 && liveReceiver.socket?.readyState!==1;i++) await new Promise(r=>setTimeout(r,25));
      check(liveReceiver.socket?.readyState===1, 'browser establishes authenticated WebSocket');
      await sender.send({id:crypto.randomUUID(), from:sender.state.id, to:liveReceiver.state.id, action:'love', payload:{character:'nematode'}});
      while(sender.running) await new Promise(r=>setTimeout(r,1));
      for(let i=0;i<200 && !delivery.active;i++) await new Promise(r=>setTimeout(r,25));
      check(delivery.active, 'live notification delivers gesture to overlay');
      step(20);
    })()`);
    await run(`(async()=>{while(liveReceiver.running) await new Promise(r=>setTimeout(r,1)); await liveReceiver.cycle(); liveReceiver.stop(); check(liveReceiver.state.inbox.length===0 && liveReceiver.state.receipts.length===0, 'overlay completion acknowledges real HTTP gesture')})()`);
  }
  console.log('Passed: fan actions, edge placement, dismissal, both visitors, rope lifecycle, gold delivery, temporary summon, reduced motion and client routing.');
} finally {
  socket?.close();
  chrome.kill();
  await new Promise(resolve => chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
}
