// Browser checks without a test dependency. CHROME can point at another Chromium executable.
import { spawn, execFileSync } from 'node:child_process';
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
  // Keep the approved release drawings intact while adding transition frames.
  for (const id of ['nematode','croissant','kitten']) {
    let source=execFileSync('git',['show',`v0.3.13:src/characters/${id}.js`],{encoding:'utf8'});
    // Approved correction: all planted kitten paws share the ground plane.
    if(id==='kitten')source=source.replace('y:(far?-6:0)-lift','y:-lift');
    await run(`{
      const released={};new Function('CHARACTERS','drawHat',${JSON.stringify(source)})(released,drawHat);
      for(const state of ['idle','walk','held','fly','stomp','sit','cuddle'])
        for(const hat of Object.keys(HATS))for(const face of [-1,1]) {
          function picture(character) {
            const canvas=document.createElement('canvas');canvas.width=canvas.height=300;
            const instance=character.create?.()||character;
            instance.draw(canvas.getContext('2d'),{x:150,ground:230,face,rot:.1,accel:[0,0],dt:.016,now:1000,hat},
              {state,cuddle:1,phase:.3,t:1,stretch:1,hop:0,crouch:0,impact:0,airborne:false});
            return canvas.toDataURL();
          }
          if(picture(released['${id}'])!==picture(CHARACTERS['${id}']))
            throw Error('Changed released artwork: ${id} '+state+' '+hat+' '+face);
        }
    }`);
  }
  await run(`
    window.step = seconds => { for (let i = 0; i < seconds * 60; i++) tick(last + 1000 / 60); };
    Object.assign(n, {x: 450, y: 550, state: 'idle', t: 0, home: 450, nextWander: 100});
    want.mode = 'free'; want.floor = 550; step(.1);
    window.check = (condition, message) => { if (!condition) throw new Error(message); };
    for (const character of Object.values(CHARACTERS)) for (const state of ['sit','cuddle']) {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=300;
      const paint=canvas.getContext('2d');
      const shape=character.draw(paint,{x:150,ground:240,face:1,rot:0,accel:[0,0],dt:.016,now:1000,hat:'cap'},
        {state,cuddle:1,phase:0,t:1,stretch:1,hop:0,crouch:0,impact:0,airborne:false});
      check(shape instanceof Path2D, 'Seated characters preserve the hit-test contract');
      check(paint.getImageData(0,0,300,300).data.some((v,i)=>i%4===3 && v), 'Seated character renders');
    }
    {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=200;
      const paint=canvas.getContext('2d');
      const h={x:100,y:150,toX:null,colors:HEART_COLORS,t:.3,sway:0,dir:1};
      drawHeartEffect(paint,h);
      const pixels=paint.getImageData(0,0,200,200).data;let left=200,right=0;
      for(let y=0;y<200;y++)for(let x=0;x<200;x++)if(pixels[(y*200+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x)}
      check(right-left>=24 && right-left<=30,'Shared heart keeps its desktop size');
      paint.clearRect(0,0,200,200);drawHeartEffect(paint,{...h,t:1.8});
      check(!paint.getImageData(0,0,200,200).data.some(v=>v),'Expired hearts disappear');
    }
    for (const character of Object.values(CHARACTERS)) for (const hat of Object.keys(HATS)) {
      for (const face of [-1,1]) for (const rot of [0,.8]) {
        const canvas=document.createElement('canvas'); canvas.width=400; canvas.height=400;
        const paint=canvas.getContext('2d'); paint.scale(2,2);
        const at={x:100,ground:160,face,rot,accel:[0,0],dt:.016,now:1000,hat};
        const m={state:'idle',phase:0,t:0,stretch:1,hop:0,crouch:0,impact:0,airborne:false};
        const shape=character.draw(paint,{...at,hat:'none'},m);
        const before=paint.getImageData(0,0,400,400).data;
        paint.clearRect(0,0,200,200); const outline=character.draw(paint,at,m);
        const after=paint.getImageData(0,0,400,400).data;
        let extra=0, hittable=0;
        for(let y=0;y<400;y++) for(let x=0;x<400;x++) {
          const k=(y*400+x)*4+3;
          if(before[k]===0 && after[k]>240) {extra++; if(paint.isPointInPath(outline,x+.5,y+.5)) hittable++;}
        }
        if(hat!=='none') check(extra>30 && hittable/extra>.65, 'hat remains attached and hittable at Retina scale: '+character.name+'/'+hat+' '+face+' '+rot+' '+extra+' '+hittable);
      }
    }
    window.openFan = () => cv.dispatchEvent(new MouseEvent('contextmenu', {clientX: n.x, clientY: n.y - 30, bubbles: true, cancelable: true}));
    window.pick = label => [...fan.element.querySelectorAll('[role=menuitem]')].find(b => b.getAttribute('aria-label') === label).dispatchEvent(new MouseEvent('click', {bubbles:true}));
    openFan(); check(fan.open, 'right-click opens fan');
    check(fan.element.querySelectorAll('[role=menuitem]').length === 4, 'four actions');
    check(press === null, 'right-click must not grab');
    const stillX = n.x; step(1); check(n.x === stillX, 'menu pauses movement');
    check(fan.element.offsetWidth === 320, 'four-segment fan stays readable');
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
  await mouse('mousePressed', 50, 123, 1);
  await mouse('mouseMoved', 114, 58, 1);
  await run(`check(fan.element.querySelector('.active')?.getAttribute('aria-label') === 'Send I love you', 'drag transfers active segment');`);
  await call('Page.captureScreenshot', {format:'png'}).then(r => writeFile('/private/tmp/nematode-fan-drag.png', Buffer.from(r.data, 'base64')));
  await mouse('mouseReleased', 114, 58);
  await run(`check(chosen.length === 1 && chosen[0] === 'love', 'release chooses only the destination'); openFan(); fan.element.querySelector('svg').setCurrentTime(1);`);
  await mouse('mousePressed', 50, 123, 1);
  await mouse('mouseMoved', 350, 160, 1);
  await mouse('mouseReleased', 350, 160);
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
    pick('Be together'); step(3); check(together.guest.character.appearance.character === 'nematode', 'other character works');
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
    check(delivery.guest.actor.character.appearance.character === 'nematode' && character().appearance.character === 'croissant', 'sender character is preserved');
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
    check(delivery.guest.actor.character.appearance.character === 'nematode', 'love uses sender character');
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
    check(delivery.queue[0].character.appearance.character === 'croissant', 'debug uses Croissant for Nematode');
    delivery.queue.length = 0;
    setCharacter('croissant'); previewReceive('love');
    check(delivery.queue[0].character.appearance.character === 'nematode', 'debug uses Nematode for Croissant');
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
  await run(`
    delivery.guest=null; delivery.queue.length=0; actors.byId.clear(); together.guest=null; together.active=false;
    const look={character:'croissant',accessories:{hat:'cap'},future:{color:'blue'}};
    for(const action of ['heart','love']) {
      check(receiveGesture({action,payload:{character:look.character,appearance:look}}), 'dressed visitor accepted');
      step(.02); check(delivery.guest.actor.character.appearance.accessories.hat==='cap', 'gesture carries the hat');
      delivery.guest=null; delivery.queue.length=0; actors.byId.clear();
    }
    together.join(createCharacter(look)); together.guest.x=321; together.guest.t=8;
    together.join(createCharacter({...look,accessories:{hat:'sunhat'}}));
    check(together.guest.character.appearance.accessories.hat==='sunhat' && together.guest.x===321 && together.guest.t===8,
      'together appearance updates without restarting arrival');
    const captured=[], dressed=new BuddyClient('me',{send:e=>captured.push(e)},()=>look);
    dressed.send('you','future-gesture'); look.accessories.hat='beret';
    check(captured[0].payload.appearance.accessories.hat==='cap' && captured[0].payload.appearance.future.color==='blue',
      'every action automatically captures the complete appearance');
    together.guest=null; together.active=false;
  `);
  await call('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await run(`
    actors.byId.clear();delivery.guest=null;delivery.queue.length=0;together.guest=null;together.active=false;together.presentation=null;
    setCharacter('kitten');setHat('cap');
    Object.assign(n,{x:450,y:550,state:'idle',home:450,nextWander:100});want.mode='free';
    const peer={id:'partner',appearance:{character:'croissant',accessories:{hat:'beanie'}}};
    for(const mode of ['together','picnic']) {
      selectScene({mode,future:{setting:'retained'}},peer);step(mode==='picnic'?18:4);
      check(together.guest.ready && together.guest.visible,'Shared actor is on screen');
      const actor=together.guest;
      for(const action of ['heart','love']) {
        let completed=0;
        receiveGesture({from:peer.id,action,payload:{character:'croissant',appearance:peer.appearance}},()=>completed++);
        step(.05);
        check(delivery.guest.actor===actor && actors.byId.size===1,'Gesture uses the existing actor in '+mode);
        check(delivery.guest.state==='give','Existing actor gives immediately without walking in');
        step(4);check(completed===1 && together.guest===actor,'One receipt, persistent actor remains');
      }
      const saved=localStorage.getItem('nematode-session');
      together.guest=null;together.active=false;together.presentation=null;actors.byId.clear();restoreScene();step(mode==='picnic'?18:4);
      check(together.mode===mode && session.future.setting==='retained','Opaque mode state restores across restart');
      check(localStorage.getItem('nematode-session')===saved,'Restoration preserves future state fields');
    }
    openFan();check(fan.element.textContent.includes('Endpicnic'),'End picnic replaces picnic');fan.hide();
    openFan();
    check(!fan.element.textContent.includes('Separate') && !fan.element.textContent.includes('Betogether'),'Picnic exposes only its own exit action');
    fan.hide();
    {
    const scene=together.presentation, guest=together.guest;
    const before={x:n.x,y:n.y,gx:guest.x,gy:guest.y,phase:scene.phase,sit:scene.sit};
    cv.setPointerCapture=()=>{};
    // Grab the companion, not just the resident; both must belong to the scene hit area.
    check(isOver(guest.x,guest.y-20),'Companion is part of the scene drag target');
    const pointer=(type,x,y)=>{const e=new PointerEvent(type,{clientX:x,clientY:y,button:0,pointerId:1,bubbles:true});Object.defineProperty(e,'timeStamp',{value:last});cv.dispatchEvent(e);};
    pointer('pointerdown',guest.x,guest.y-20);
    pointer('pointermove',before.gx+80,before.gy-70);
    step(.5);
    check(n.x===before.x+80 && n.y===before.y-50,'Scene drag translates resident');
    check(guest.x===before.gx+80 && guest.y===before.gy-50,'Scene drag translates companion equally');
    check(scene.phase===before.phase && scene.sit===before.sit && n.state!=='held','Scene drag preserves seated poses');
    check(Math.abs(scene.anchor.angle)>.001,'Held picnic has weight and swing');
    pointer('pointerup',before.gx+80,before.gy-70);step(.08);
    check(scene.anchor.falling && n.y>before.y-50,'Released picnic falls under gravity');
    nema({...want});step(.08);
    check(n.state==='idle' && scene.anchor.falling,'Presence refresh keeps scene physics in control');
    step(4);
    check(!scene.moving && Math.abs(scene.anchor.angle)<.002,'Picnic settles upright after landing');
    check(Math.abs(n.y+scene.anchor.basketDrop+3.5-want.floor)<.1,'Basket settles on the same floor as the blanket');
    check(n.y>before.y-50 && n.y<=want.floor,'Picnic lands on the desktop floor');
    check(Math.abs((guest.x-n.x)-(before.gx-before.x))<.01,'Landing preserves the composition');
    const gap=(character().seated.width+guest.character.seated.width)*.29;
    const width=(character().seated.width+guest.character.seated.width)*.65+100;
    const targets=[()=>[n.x,n.y-40],()=>[n.x-gap/2,n.y+2],
      ()=>[n.x-gap/2-width/2-guest.character.width*.30,n.y-12]];
    for(const target of targets){
      const [x,y]=target(),oldX=n.x,oldY=n.y,oldGuest=guest.x;
      check(isOver(x,y),'Resident, blanket and basket belong to the scene hit area');
      pointer('pointerdown',x,y);pointer('pointermove',x+12,y-70);step(.1);
      check(Math.abs(n.x-oldX-12)<.01 && Math.abs(n.y-oldY+70)<.01 && Math.abs(guest.x-oldGuest-12)<.01,'Every picnic part drags the whole physical scene');
      cv.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}));step(.1);
      check(!scene.dragging && scene.anchor.falling && n.state!=='fly','Pointer cancellation drops the scene as one body');
      step(4);
    }
    openFan();pick('End picnic');
    check(session.mode==='together','End picnic returns to walking together');
    step(18);
    }

  `);
  await call('Page.captureScreenshot',{format:'png'}).then(r=>writeFile('/private/tmp/nematode-picnic-mode.png',Buffer.from(r.data,'base64')));
  await run(`
    const supports=[[-130,12],[100,12],[-130,-100],[100,-100]];
    const landings=[];
    for(const hz of [30,60,144]){
      const body=new PicnicBody(350,330);body.grab({x:350,y:280});body.move(30,-70);
      body.step(1/60,550,900,supports,false);
      check(body.angle!==0 && body.flutter>0,'Drag motion drives swing and cloth');
      const before={x:body.x,y:body.ground};body.release({vx:420,vy:-240});
      body.step(1/hz,550,900,supports,false);
      check(body.x>before.x && body.ground<before.y,'Release preserves throw momentum');
      for(let i=0;i<hz*6;i++)body.step(1/hz,550,900,supports,false);
      check(!body.falling && Math.abs(body.ground-538)<.01,'Gravity lands the blanket edge on the floor');
      check(body.x>=130 && body.x<=800,'Whole scene stays inside horizontal bounds');
      check(Math.abs(body.basket)<.002 && body.flutter<.01,'Basket and cloth settle without idle wobble');
      landings.push(body.x);
    }
    check(Math.max(...landings)-Math.min(...landings)<12,'Physics remains consistent across frame rates: '+landings.join(','));
    {
      const body=new PicnicBody(400,200);body.grab({x:400,y:150});body.move(80,-40);
      body.step(1/60,550,900,supports,false);body.release({vx:500,vy:100});
      body.step(.05,550,900,supports,false);
      const point=body.matrix.transformPoint({x:body.x-40,y:body.ground-20});
      const before=body.matrix.transformPoint({x:body.x,y:body.ground});
      body.grab(point);
      const after=body.matrix.transformPoint({x:body.x,y:body.ground});
      check(Math.hypot(before.x-after.x,before.y-after.y)<.01,'Airborne re-grab preserves the visible pose');
      body.release();for(let i=0;i<360;i++)body.step(1/60,550,900,supports,true);
      check(!body.falling && body.angle===0 && body.flutter===0,'Reduced motion retains gravity without decorative sway');
    }
    // The curled and flat cloth meet at the same material edge, throughout unfurling.
    for(const spread of [0,.1,.5,.9,.999,1])for(const v of [0,.5,1]) {
      const a=blanketPoint(220,52,spread,spread,v);
      const b=blanketPoint(220,52,spread,Math.min(1,spread+1e-7),v);
      check(Math.hypot(a[0]-b[0],a[1]-b[1])<.01,'Rolled fabric stays attached to the flat fabric');
    }
    // Choreography preserves actor position and visits every physical setup/packing stage.
    for(const id of Object.keys(CHARACTERS)) {
      const guest={character:createCharacter({character:id}),x:-150,y:550,phase:0,visible:false};
      const picnic=new PicnicScene(guest), phases=new Set();let previous=guest.x, placementX=null, unrollTime=0;
      const at={x:450,ground:550,dt:1/60,now:0,settled:true};
      for(let i=0;i<1400;i++) {
        picnic.draw(ctx,at,character(),guest,true);phases.add(picnic.phase);
        if(picnic.phase==='place') {placementX??=guest.x;check(guest.x===placementX,'Placement lowers supplies without lateral travel');}
        if(picnic.phase==='unroll')unrollTime+=at.dt;
        check(Math.abs(guest.x-previous)<5,'Picnic never teleports a character');previous=guest.x;
      }
      check(['arrive','place','unroll','approach','sit','rest'].every(p=>phases.has(p)),'Every setup phase plays');
      check(unrollTime<.6,'Unfurling is a quick roll');
      check(guest.ready && picnic.sit===1 && picnic.spread===1,'Ready only after setup');
      picnic.exiting=true;picnic.returning=true;
      for(let i=0;i<3000&&!picnic.done;i++){picnic.draw(ctx,at,character(),guest,true);phases.add(picnic.phase);}
      check(picnic.done && ['rise','retrieve','pack','lift','depart','return'].every(p=>phases.has(p)),'Pack up and return without a cut');
    }
    // Separating during an arrival must not acknowledge a gesture that never played.
    const registry=new Actors(), scene=new Together(registry);let given=0,receipts=0;
    const visit=new Delivery(()=>given++,registry), sender=createCharacter({character:'nematode'});
    scene.join(sender,'pending-peer');visit.enqueue(sender,'heart',()=>receipts++,'pending-peer');
    const at={x:450,ground:550,dt:1/60,now:0,settled:true};
    scene.draw(ctx,at,character(),true);visit.draw(ctx,at,character());scene.separate();
    for(let i=0;i<1200;i++){scene.draw(ctx,at,character(),true);visit.draw(ctx,at,character());}
    check(given===1 && receipts===1 && registry.byId.size===0,'Separating during arrival still delivers exactly once');
    visit.enqueue(sender,'love',()=>{},'adopted-peer');visit.draw(ctx,at,character());
    const arriving=visit.guest.actor;scene.join(sender,'adopted-peer');
    check(scene.guest===arriving && registry.byId.size===1,'Joining adopts an existing delivery actor');
    for(const left of Object.keys(CHARACTERS))for(const right of Object.keys(CHARACTERS))
      for(const a of Object.keys(HATS))for(const b of Object.keys(HATS)) {
        const paint=document.createElement('canvas').getContext('2d');paint.canvas.width=paint.canvas.height=400;paint.translate(200,260);
        const result=drawPicnic(paint,createCharacter({character:left,accessories:{hat:a}}),createCharacter({character:right,accessories:{hat:b}}),.4);
        check(result.hit instanceof Path2D && Number.isFinite(result.rightX),'Every pairing/hat composition renders');
      }
    selectScene({mode:'solo'});step(10);
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
  await new Promise(resolve => chrome.exitCode !== null || chrome.signalCode !== null ? resolve() : chrome.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
}
