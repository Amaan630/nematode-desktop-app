// The overlay's behavior: where the character goes, how he moves, physics, grabbing, dust and hearts.
// It never draws a character itself. Each frame it describes the moment as a neutral `motion` and hands it,
// with his position, to the current character (src/characters/*.js), which draws it its own way.
//
// A character registers itself as CHARACTERS[id] = {
//   name,                      shown in the app's Character menu
//   width, height,             rough on-screen size in px (screen edges, cursor distance, stomp height)
//   dust,                      color of the puffs he kicks up
//   gait: { hz, pace(phase) }, walk cycles per second, and a speed multiplier at that point in the cycle
//   draw(ctx, at, motion),     at: { x, ground, face, rot, accel: [ax, ay] px/s², dt, now, zoom? (default 1) }
// }                            draw returns his outline (Path2D, screen px) for grabbing.
//
// motion: { state: 'walk' | 'stomp' | 'idle' | 'leap' | 'held' | 'fly' | 'sit' | 'cuddle',
//           phase (cycle 0..1), t (s in this state), stretch (1 normal, <1 squashed, >1 tall),
//           hop (px off the ground), crouch (0..1 winding up), impact (0..1 just landed), airborne,
//           sit? (0 standing .. 1 seated; absent uses state), cuddle? (0..1) }

const SPEED = 210;                           // walking px/s
const STOMP = 0.62, STOMPS = 3, REST = 1.4;  // 3 stomps, then a breather
const G = 2600, BOUNCE = 0.5;                // throw physics: gravity px/s², wall bounciness
const HELD_HZ = 5;                           // wriggle/paddle cycles per second while held
const CLICK_PX = 5, CLICK_S = .25;           // a press that moves less and lets go sooner is a click, not a grab

const tauri = window.__TAURI__?.core;
const cv = document.querySelector('canvas'), ctx = cv.getContext('2d');
let dpr = 1;
function fit() {
  dpr = devicePixelRatio;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit(); addEventListener('resize', fit);

// --- Who's out ---------------------------------------------------------------------------------
// Set by the app (menu bar > Character) or ?char= in the browser preview.
let characterId = new URLSearchParams(location.search).get('char');
if (!Object.hasOwn(CHARACTERS, characterId)) characterId = 'nematode';
let resident;
const appearance = () => ({ character: characterId || 'nematode', accessories: { hat: hatId } });
const character = () => resident ||= createCharacter(appearance());
let hatId = localStorage.getItem('hat') || 'none';
function refreshAppearance() {
  resident = null;
  if (tauri) {
    const png = renderCharacterPreview(appearance()).toDataURL('image/png').split(',')[1];
    tauri.invoke('set_character_preview', { png: Array.from(atob(png), c => c.charCodeAt(0)) }).catch(console.error);
  }
}
function setHat(id) { if (Object.hasOwn(HATS, id)) { hatId = id; refreshAppearance(); localStorage.setItem('hat', id); start(); } }
tauri?.invoke('get_hat').then(setHat).catch(console.error);
function setCharacter(id) { if (!Object.hasOwn(CHARACTERS, id)) return; fan.hide(); characterId = id; refreshAppearance(); }
tauri?.invoke('get_character').then(setCharacter).catch(() => {});
const OFF = () => -character().width; // just past the left edge

// --- State ---------------------------------------------------------------------------------------
// n.y is where his feet are. want is what the app says he should be doing:
//   away = leave; tab = stomp on the Claude tab at (x, y); free = summoned, roam the floor.
const n = { x: -200, y: 0, face: 1, state: 'gone', phase: 0, t: 0, landed: -1, rot: 0, vx: 0, vy: 0, vr: 0, squash: 0,
            home: null, cursor: null, wasNear: false, fleeing: false, flees: 0, nextWander: 0 };
const want = { mode: 'away', x: 0, y: 0, floor: innerHeight };
let hit = null, hover = false, press = null, drag = null, dust = [], hearts = [], running = false, last = 0, polling = false;
let prevPos = null, prevVel = [0, 0];

// Called by the app: { mode: 'away' | 'tab' | 'free', x, y, floor, reset }.
function nema(m) {
  if (m.reset || m.mode === 'away') fan.hide();
  if (m.reset) Object.assign(n, { x: OFF(), state: 'gone' });
  if (m.floor) want.floor = m.floor;
  if (m.mode === 'tab') Object.assign(want, { x: m.x, y: m.y });
  if (m.mode === 'free' && want.mode !== 'free') n.home = null; // pick a fresh spot
  want.mode = m.mode;
  if (n.state === 'gone') {
    if (want.mode === 'away' && !delivery.active) return;
    Object.assign(n, { x: OFF(), y: want.mode === 'tab' ? want.y : want.floor });
  }
  if (['gone', 'walk', 'stomp', 'idle'].includes(n.state)) go(); // held/fly/leap check `want` when they finish
  start();
}
function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

// --- Deciding where to go ------------------------------------------------------------------------
const clampX = x => Math.max(character().width, Math.min(innerWidth - character().width, x));
function goal() {
  if (delivery.active && want.mode === 'away') return { x: innerWidth * .6, y: want.floor, then: 'idle' };
  if (together.presentation || (scenes[together.mode]?.resting && together.active)) return { x: n.home ?? clampX(innerWidth/2), y: want.floor, then: 'idle' };
  if (want.mode === 'tab') return { x: want.x, y: want.y, then: 'stomp' };
  if (want.mode === 'free') {
    n.home ??= clampX(innerWidth * (.25 + Math.random() * .5));
    return { x: n.home, y: want.floor, then: 'idle' };
  }
  return { x: OFF(), y: n.y, then: 'gone' };
}

// Pick the next move toward the goal: walk over, leap up/down, then settle into stomping or idling.
function go() {
  const g = goal(), settled = n.state === 'stomp' || n.state === 'idle';
  if (settled && want.mode !== 'away' && Math.abs(g.y - n.y) > 4) return leap(g);
  if (Math.abs(g.x - n.x) > 2) return n.state = 'walk';
  if (Math.abs(g.y - n.y) > 4) return leap(g);
  if (n.state === g.then) return;
  Object.assign(n, { state: g.then, t: 0, landed: -1, nextWander: 5 + Math.random() * 8 });
}
function leap(g) {
  const dx = g.x - n.x, dy = g.y - n.y;
  Object.assign(n, { state: 'leap', t: 0, from: [n.x, n.y], to: [g.x, g.y], face: Math.sign(dx) || n.face,
                     dur: .45 + Math.min(.6, Math.hypot(dx, dy) / 2000), arc: 50 + .25 * Math.abs(dy) });
}

// Summoned and idle: now and then he wanders off, and sometimes he bolts when your cursor gets close.
function idle() {
  if (delivery.active) return;
  const c = n.cursor, near = c && Math.hypot(c[0] - n.x, c[1] - (n.y - character().height / 2)) < 140;
  if (!near) { n.wasNear = false; n.flees = 0; }
  else if (!n.wasNear) {
    n.wasNear = true;
    if (n.flees < 3 && Math.random() < .5) return flee(c);
  }
  if (n.t > n.nextWander) { n.home = clampX(n.x + (Math.random() - .5) * 600); go(); }
}
function flee(c) {
  let dir = Math.sign(n.x - c[0]) || 1;
  if (clampX(n.x + dir * 200) === n.x) dir = -dir; // cornered: dash the other way
  Object.assign(n, { fleeing: true, flees: n.flees + 1, home: clampX(n.x + dir * (220 + Math.random() * 180)) });
  go();
}

// --- Moves ---------------------------------------------------------------------------------------
const ease = k => k * k * (3 - 2 * k);
// Stomp, stomp, stomp, breathe: wind up, hop, land with a squash.
function stomp(t) {
  const tc = t % (STOMP * STOMPS + REST);
  if (tc >= STOMP * STOMPS) { const b = Math.sin(tc * 4); return { stretch: 1 + .02 * b, crouch: .17 * b }; }
  const u = (tc % STOMP) / STOMP;
  if (u < .25) { const k = ease(u / .25); return { stretch: 1 - .16 * k, crouch: k }; }
  if (u < .55) return { hop: character().height * .32 * Math.sin(Math.PI * (u - .25) / .3), stretch: 1.08, airborne: true };
  const land = Math.floor(t / STOMP);
  if (land !== n.landed) { n.landed = land; puff(); }
  const k = (u - .55) / .45, d = Math.exp(-6 * k);
  return { stretch: 1 - .22 * d * Math.cos(10 * k), impact: d };
}

// Thrown: gravity, spin, bounce off every screen edge, slide to a stop on the floor, stand up, carry on.
function fly(dt) {
  const W = innerWidth, H = want.floor, side = character().width * .3;
  n.vy += G * dt; n.x += n.vx * dt; n.y += n.vy * dt; n.rot += n.vr * dt;
  if (n.x < side || n.x > W - side) {
    n.x = Math.min(W - side, Math.max(side, n.x)); n.vx *= -BOUNCE; n.vr *= -.6;
  }
  if (n.y < character().height) { n.y = character().height; n.vy = Math.abs(n.vy) * BOUNCE; }
  if (n.y >= H) {
    n.y = H;
    if (n.vy > 250) {
      n.squash = Math.min(.3, n.vy / 4000);
      if (n.vy > 700) puff(6);
      n.vy *= -BOUNCE * .8; n.vx *= .85;
    } else n.vy = 0;
  }
  if (n.y >= H && n.vy === 0) {  // on the floor: friction, roll upright, then get going
    n.vx *= Math.exp(-5 * dt); n.vr = 0;
    n.rot = Math.atan2(Math.sin(n.rot), Math.cos(n.rot)) * Math.exp(-8 * dt);
    if (Math.abs(n.vx) < 20 && Math.abs(n.rot) < .08) {
      if ((n.t += dt) > .4) { Object.assign(n, { rot: 0, vx: 0, t: 0, home: n.x }); go(); } // summoned: stay where he landed
    } else n.t = 0;
  }
  n.squash *= Math.exp(-10 * dt);
}

function walk(dt) {
  const tx = goal().x, dir = Math.sign(tx - n.x), fast = n.fleeing ? 2.3 : 1, { hz, pace } = character().gait;
  n.face = dir || n.face;
  n.phase = (n.phase + dt * hz * (n.fleeing ? 1.7 : 1)) % 1;
  n.x += dir * SPEED * fast * pace(n.phase) * dt;
  if (!dir || Math.sign(tx - n.x) !== dir) {
    n.x = tx;
    if (n.fleeing) Object.assign(n, { fleeing: false, wasNear: false }); // still close? he may bolt again
    go();
  }
}

// --- Dust ----------------------------------------------------------------------------------------
function puff(count = 10) {
  for (let i = 0; i < count; i++) {
    const s = i % 2 ? 1 : -1;
    dust.push({ x: n.x + s * character().width * .3, y: n.y, vx: s * (30 + Math.random() * 70),
                vy: -(10 + Math.random() * 35), r: 1.5 + Math.random() * 2.5, life: 1 });
  }
}
function drawDust(dt) {
  dust = dust.filter(d => (d.life -= dt * 2) > 0);
  ctx.fillStyle = character().dust;
  for (const d of dust) {
    d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 80 * dt;
    ctx.globalAlpha = d.life; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (2 - d.life), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Hearts --------------------------------------------------------------------------------------
// Click him and a heart pops out above his head, then floats up, swaying, and fades away.
function heart(colors = HEART_COLORS, from) {
  const y = from?.y ?? n.y - character().height * 1.05;
  hearts.push({ x: from?.x ?? n.x, y: colors === GOLD_HEART_COLORS ? Math.max(80, y) : y,
    toX: from ? n.x : null, colors, t: 0, sway: Math.random() * 6, dir: Math.random() < .5 ? -1 : 1 });
  start();
}
function drawHearts(dt) {
  hearts = hearts.filter(h => (h.t += dt) < 1.8);
  for (const h of hearts) drawHeartEffect(ctx, h);
  ctx.globalAlpha = 1;
}

// --- Frame ---------------------------------------------------------------------------------------
function frame(now) {
  try { tick(now); } catch (e) { console.error(e); } // one bad frame must never freeze him
  if (n.state !== 'gone' || dust.length || hearts.length || words.length) requestAnimationFrame(frame);
  else { running = false; setHover(false); }
}

function tick(now) {
  const dt = Math.max(.001, Math.min(.05, (now - last) / 1000)); last = now; // never 0: speeds divide by it
  if (fan.open || together.arriving || ((together.presentation || (scenes[together.mode]?.resting && together.active)) && n.state === 'idle')) { /* keep him still while choosing or pulling the rope */ }
  else if (n.state === 'walk') walk(dt);
  else if (n.state === 'leap') {
    const u = Math.min(1, (n.t += dt) / n.dur);
    n.x = n.from[0] + (n.to[0] - n.from[0]) * u;
    n.y = n.from[1] + (n.to[1] - n.from[1]) * u - 4 * n.arc * u * (1 - u);
    if (u === 1) { puff(); n.state = 'landing'; go(); }
  } else if (n.state === 'stomp') n.t += dt;
  else if (n.state === 'idle') { n.t += dt; idle(); }
  else if (n.state === 'fly') fly(dt);
  else if (n.state === 'held') n.phase = (n.phase + dt * HELD_HZ) % 1;

  // The moment, described for whichever character is out.
  const motion = { state: n.state, phase: n.phase, t: n.t, stretch: 1, hop: 0, crouch: 0, impact: 0, airborne: false };
  if (fan.open || together.arriving) motion.state = 'idle';
  else if (n.state === 'stomp') Object.assign(motion, stomp(n.t));
  else if (n.state === 'leap') Object.assign(motion, { stretch: 1.12 - .2 * n.t / n.dur, airborne: true });
  else if (n.state === 'fly') Object.assign(motion, { stretch: 1 - n.squash, impact: n.squash, airborne: true });

  // His acceleration on screen, for characters with physics of their own (wobbly bits).
  const v = prevPos ? [(n.x - prevPos[0]) / dt, (n.y - prevPos[1]) / dt] : [0, 0];
  const accel = [(v[0] - prevVel[0]) / dt, (v[1] - prevVel[1]) / dt];
  prevPos = n.state === 'gone' ? null : [n.x, n.y]; prevVel = v;

  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const delivering = delivery.active;
  delivery.draw(ctx, { x: n.x, ground: n.y, dt, now }, character());
  if (delivering && !delivery.active && ['idle', 'stomp', 'walk'].includes(n.state)) go();
  const sceneHit = together.draw(ctx, { x: n.x, ground: n.y, dt, now, settled: ['idle', 'stomp'].includes(n.state) }, character(), n.state !== 'gone');
  hit = n.state === 'gone' ? null
    : sceneHit || character().draw(ctx, { x: n.x, ground: n.y, face: n.face, rot: n.rot, accel, dt, now }, motion);
  drawDust(dt);
  drawHearts(dt);
  drawWords(dt);
  pollCursor();
}

// --- Grabbing ------------------------------------------------------------------------------------
// The overlay ignores the mouse so clicks reach your apps. While the cursor is over him we take the
// mouse, so you can grab him. A press only becomes a grab once it moves or lasts; a quick click gets a heart.
function isOver(x, y) {
  if (!hit) return false;
  ctx.lineWidth = 14;
  return ctx.isPointInPath(hit, x * dpr, y * dpr) || ctx.isPointInStroke(hit, x * dpr, y * dpr);
}
function setHover(h) {
  h = fan.open || h;
  if (h === hover) return;
  hover = h;
  cv.style.cursor = h ? 'grab' : '';
  tauri?.invoke('set_grabbable', { on: h });
}
function pollCursor() {
  if (!tauri || drag || polling || n.state === 'gone') return;
  polling = true;
  tauri.invoke('cursor').then(([x, y]) => { n.cursor = [x, y]; setHover(isOver(x, y)); }).finally(() => polling = false);
}

function grab() {
  clearTimeout(press.timer);
  cv.style.cursor = 'grabbing';
  drag = press; press = null;
  Object.assign(n, { state: 'held', vx: 0, vy: 0 });
  start();
}
cv.addEventListener('pointermove', e => {
  if (press && (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_PX || e.timeStamp - press.at > CLICK_S * 1000)) grab();
  if (!drag) return press || tauri || (n.cursor = [e.clientX, e.clientY], setHover(isOver(e.clientX, e.clientY))); // browser preview
  n.x += e.clientX - drag.x; n.y += e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.hist.push([e.timeStamp, e.clientX, e.clientY]);
  while (drag.hist.length > 2 && e.timeStamp - drag.hist[0][0] > 80) drag.hist.shift();
  n.rot += (Math.max(-.6, Math.min(.6, (e.clientX - drag.hist[0][1]) * .01)) - n.rot) * .3; // swing with the drag
});
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.ctrlKey || fan.open || together.arriving) return;
  if (!isOver(e.clientX, e.clientY)) return;
  cv.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, at: e.timeStamp, hist: [[e.timeStamp, e.clientX, e.clientY]] };
  press.timer = setTimeout(() => press && grab(), CLICK_S * 1000); // held still: still a grab
});
cv.addEventListener('pointerup', e => {
  if (e.button !== 0) return;
  if (press) { clearTimeout(press.timer); press = null; heart(); tauri?.invoke('release'); return; }
  if (!drag) return;
  const [t0, x0, y0] = drag.hist[0], dt = Math.max(.016, (e.timeStamp - t0) / 1000);
  const clamp = v => Math.max(-4000, Math.min(4000, v));
  Object.assign(n, { state: 'fly', vx: clamp((e.clientX - x0) / dt), vy: clamp((e.clientY - y0) / dt), t: 0 });
  n.vr = Math.max(-14, Math.min(14, n.vx * .006));
  drag = null;
  cv.style.cursor = 'grab';
  tauri?.invoke('release'); // hand focus back to Chrome
});

// --- Shared gestures -----------------------------------------------------------------------------
const buddy = new BuddyClient('local-preview', null, appearance);
let connection = null;
const actors = new Actors();
const together = new Together(actors);
const delivery = new Delivery((action, from) => actions[action].play(from), actors);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let words = [];
const scenes = {
  solo: {},
  together: {},
  picnic: {
    resting: true,
    create: guest => new PicnicScene(guest),
  },
};
let session = { mode: 'solo' };
function selectScene(state, peer = connection?.peer) {
  if (!state || !Object.hasOwn(scenes, state.mode)) return false;
  if (state.mode === 'solo') together.separate();
  else {
    peer ||= { id: 'preview-peer', appearance: { ...appearance(), character: Object.keys(CHARACTERS).find(id => id !== appearance().character) || appearance().character } };
    const guest = createCharacter(peer);
    if (!guest) return false;
    together.join(guest, peer.id, state.mode, scenes[state.mode].create);
    if (want.mode === 'away') {
      if (tauri) tauri.invoke('summon_for_together').catch(console.error);
      else nema({ mode: 'free', floor: want.floor });
    }
  }
  const changed = session.mode !== state.mode;
  session = structuredClone(state);
  localStorage.setItem('nematode-session', JSON.stringify({ state: session, peer }));
  if (changed) n.home = clampX(innerWidth / 2);
  go(); start();
  return true;
}
function restoreScene() {
  try {
    const saved = JSON.parse(localStorage.getItem('nematode-session') || 'null');
    if (saved) selectScene(saved.state, saved.peer);
  } catch (e) { console.warn('Could not restore scene', e); }
}
const actions = {
  heart: { visit: true, label: 'Send a heart', lines: ['Send a', 'heart'],
    icon: '<path fill="#ffcf50" stroke="#96601f" d="M12 22 2 12Q-2 2 6 2Q10 2 12 6Q16-1 22 3Q28 8 22 14Z"/><path stroke="#fff3be" d="m5 8 2-2"/>',
    play: from => heart(GOLD_HEART_COLORS, from) },
  love: { visit: true, label: 'Send I love you', lines: ['Send', 'I love you'],
    icon: '<path fill="#ffc9d9" d="M1 3Q11 0 23 3L24 18 15 19 9 25 8 19 1 18Z"/><path fill="#c84c70" stroke="none" d="m12 15-5-5q-2-5 3-4l2 2 2-2q5-1 3 4Z"/>',
    play: from => say('I love you', from) },
  together: { receive: guest => together.join(guest), scene: 'together', visible: () => !together.active, label: 'Be together', lines: ['Be', 'together'], icon: '<path stroke="#c53651" stroke-width="2.8" d="M0 16Q8 20 12 10C-1-6-1 25 12 10C24-6 28 23 12 10Q17 21 25 16M12 11 7 22m6-11 6 11"/>',
    play: () => selectScene({mode:'together'}) },
  separate: { scene: 'solo', visible: () => together.active, label: 'Separate', icon: '<path stroke="#c53651" stroke-width="2.8" d="M1 15Q5 18 8 13C-2 1 0 24 8 13m8 0c10-12 9 10 0 0q4 5 8 2M8 13l-3 9m11-9 4 9"/>',
    play: () => selectScene({mode:'solo'}) },
  picnic: { scene: 'picnic', visible: () => together.mode !== 'picnic' || !together.active, label: 'Picnic Mode', lines: ['Picnic','Mode'],
    icon: '<path fill="#fff9eb" stroke="#c57a88" d="M4 10Q12 8 22 10L25 23Q12 26 0 23Z"/><path fill="#cf5361" stroke="none" d="M5 11h5v5H4zm10 0h6l1 5h-7zM9 16h6v7H8z"/><path fill="#e5be83" stroke="#765340" d="M5 8Q12 6 20 8L18 15Q12 17 6 14ZM8 7C7-1 18-1 17 7"/>',
    play: () => selectScene({mode:'picnic'}) },
  end_picnic: { scene: 'together', visible: () => together.mode === 'picnic' && together.active, label: 'End picnic', lines: ['End','picnic'],
    icon: '<path d="M3 19Q12 12 23 19L20 24Q12 20 4 24ZM8 7l8 8m0-8-8 8"/>', play: () => selectScene({mode:'together'}) },
};
const fan = new ActionFan(
  () => Object.entries(actions).filter(([, action]) => !action.visible || action.visible())
    .map(([id, action]) => ({ id, ...action })),
  async id => {
    actions[id].play(); start();
    try { await buddy.send(connection ? null : 'partner-preview', actions[id].scene ? 'scene' : id, actions[id].scene ? {state:session} : {}); }
    catch (e) { console.error(e); say('Couldn’t send'); }
  },
  () => { setHover(false); tauri?.invoke('release'); },
);

// The same presentation path serves real incoming gestures and Debug previews.
function receiveGesture(event, complete = () => {}) {
  if (!Object.hasOwn(actions, event.action) || !Object.hasOwn(CHARACTERS, event.payload.character)) return false;
  const action = actions[event.action], sender = createCharacter(event.payload);
  if (action.receive) action.receive(sender);
  else if (action.visit) delivery.enqueue(sender, event.action, complete, event.from);
  else return false;
  nema({ ...want });
  return true;
}
buddy.addEventListener('action', ({ detail }) => receiveGesture(detail));

if (BACKEND_URL && !new URLSearchParams(location.search).has('demo')) {
  try {
    connection = new CloudConnection(BACKEND_URL, {
      appearance,
      isActive: async () => tauri ? await tauri.invoke('user_active') : true,
      canPlay: () => !drag && !press && !fan.open && !['held', 'fly', 'leap'].includes(n.state),
      onGesture: receiveGesture,
      onUpdate: version => tauri?.invoke('request_update', { version }),
      onState: state => selectScene(state.scene || {mode:state.active ? 'together' : 'solo'}, state.peer),
    });
    buddy.id = connection.state.id;
    buddy.transport = connection;
    // Fetch the saved character before registering this installation's profile.
    Promise.all([tauri?.invoke('get_character'), tauri?.invoke('get_hat')]).then(([id, hat]) => {
      if (id) setCharacter(id);
      if (hat) setHat(hat);
      restoreScene(); connection.start();
    }).catch(console.error);
  } catch (e) {
    buddy.transport = { send: async () => { throw e; } };
    console.error(e); say('Couldn’t connect');
  }
}

if (!connection) Promise.all([tauri?.invoke('get_character'), tauri?.invoke('get_hat')]).then(restoreScene);

function say(text, from) {
  words.push({ text, x: from?.x ?? n.x, y: from ? from.y - 36 : n.y - character().height - 44, t: 0 });
  start();
}
function drawWords(dt) {
  words = words.filter(w => (w.t += dt) < 3.6);
  for (const w of words) drawSpeech(ctx, w.text, w.x, w.y, w.t, reducedMotion.matches);
}
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (drag || press || n.state === 'gone' || !isOver(e.clientX, e.clientY)) return;
  if (fan.open) fan.hide();
  else { fan.show(n.x, n.y - character().height, n.y); setHover(true); }
});
document.addEventListener('pointerdown', e => {
  if (fan.open && !fan.element.contains(e.target)) { e.stopPropagation(); fan.hide(); }
}, true);
addEventListener('resize', () => fan.hide());
addEventListener('blur', () => fan.hide());
cv.addEventListener('pointercancel', () => {
  if (press) { clearTimeout(press.timer); press = null; }
  if (drag) { drag = null; Object.assign(n, { state: 'fly', vx: 0, vy: 0, vr: 0, t: 0 }); }
  tauri?.invoke('release');
});

// Shared by the debug menu and browser previews; choose a distinct sender from the registry.
function previewReceive(action, sender = Object.keys(CHARACTERS).find(id => id !== appearance().character)) {
  return buddy.receive({ id: crypto.randomUUID(), from: 'preview-peer', to: buddy.id,
    action, payload: { character: sender, appearance: { ...appearance(), character: sender } } });
}

// Browser preview: index.html?demo (add &char=croissant for another character)
if (new URLSearchParams(location.search).has('demo')) {
  document.body.style.background = '#dfe3e8';
  nema({ mode: 'free', floor: innerHeight - 20 });
  const preview = new URLSearchParams(location.search);
  if (preview.has('receive')) previewReceive(preview.get('receive'), preview.get('sender') || undefined);
}

// A page reload must recover the native summon/tab state.
tauri?.invoke("overlay_ready").catch(console.error);
