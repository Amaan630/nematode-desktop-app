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
// motion: { state: 'walk' | 'stomp' | 'idle' | 'leap' | 'held' | 'fly',
//           phase (cycle 0..1), t (s in this state), stretch (1 normal, <1 squashed, >1 tall),
//           hop (px off the ground), crouch (0..1 winding up), impact (0..1 just landed), airborne }

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
const character = () => CHARACTERS[characterId] || CHARACTERS.nematode;
function setCharacter(id) { characterId = id; }
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
  if (m.reset) Object.assign(n, { x: OFF(), state: 'gone' });
  if (m.floor) want.floor = m.floor;
  if (m.mode === 'tab') Object.assign(want, { x: m.x, y: m.y });
  if (m.mode === 'free' && want.mode !== 'free') n.home = null; // pick a fresh spot
  want.mode = m.mode;
  if (n.state === 'gone') {
    if (want.mode === 'away') return;
    Object.assign(n, { x: OFF(), y: want.mode === 'tab' ? want.y : want.floor });
  }
  if (['gone', 'walk', 'stomp', 'idle'].includes(n.state)) go(); // held/fly/leap check `want` when they finish
  start();
}
function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

// --- Deciding where to go ------------------------------------------------------------------------
const clampX = x => Math.max(character().width, Math.min(innerWidth - character().width, x));
function goal() {
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
function heart() {
  hearts.push({ x: n.x, y: n.y - character().height * 1.05, t: 0, sway: Math.random() * 6, dir: Math.random() < .5 ? -1 : 1 });
  start();
}
function drawHearts(dt) {
  hearts = hearts.filter(h => (h.t += dt) < 1.8);
  for (const h of hearts) {
    const pop = h.t < .25 ? 1 + .25 * Math.sin(Math.PI * h.t / .25) : 1; // overshoots, then settles
    const grow = Math.min(1, h.t / .12), rise = 70 * h.t + 25 * h.t * h.t;
    ctx.globalAlpha = Math.min(1, (1.8 - h.t) / .5);
    drawHeart(ctx, h.x + h.dir * 12 * Math.sin(2.6 * h.t + h.sway) - h.dir * 12 * Math.sin(h.sway), h.y - rise,
              26 * grow * pop, .18 * Math.sin(2.6 * h.t + h.sway + 1));
  }
  ctx.globalAlpha = 1;
}

// --- Frame ---------------------------------------------------------------------------------------
function frame(now) {
  try { tick(now); } catch (e) { console.error(e); } // one bad frame must never freeze him
  if (n.state !== 'gone' || dust.length || hearts.length) requestAnimationFrame(frame);
  else { running = false; setHover(false); }
}

function tick(now) {
  const dt = Math.max(.001, Math.min(.05, (now - last) / 1000)); last = now; // never 0: speeds divide by it
  if (n.state === 'walk') walk(dt);
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
  if (n.state === 'stomp') Object.assign(motion, stomp(n.t));
  else if (n.state === 'leap') Object.assign(motion, { stretch: 1.12 - .2 * n.t / n.dur, airborne: true });
  else if (n.state === 'fly') Object.assign(motion, { stretch: 1 - n.squash, impact: n.squash, airborne: true });

  // His acceleration on screen, for characters with physics of their own (wobbly bits).
  const v = prevPos ? [(n.x - prevPos[0]) / dt, (n.y - prevPos[1]) / dt] : [0, 0];
  const accel = [(v[0] - prevVel[0]) / dt, (v[1] - prevVel[1]) / dt];
  prevPos = n.state === 'gone' ? null : [n.x, n.y]; prevVel = v;

  ctx.clearRect(0, 0, innerWidth, innerHeight);
  hit = n.state === 'gone' ? null
    : character().draw(ctx, { x: n.x, ground: n.y, face: n.face, rot: n.rot, accel, dt, now }, motion);
  drawDust(dt);
  drawHearts(dt);
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
  if (!isOver(e.clientX, e.clientY)) return;
  cv.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, at: e.timeStamp, hist: [[e.timeStamp, e.clientX, e.clientY]] };
  press.timer = setTimeout(() => press && grab(), CLICK_S * 1000); // held still: still a grab
});
cv.addEventListener('pointerup', e => {
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

// Browser preview: index.html?demo (add &char=croissant for another character)
if (new URLSearchParams(location.search).has('demo')) {
  document.body.style.background = '#dfe3e8';
  nema({ mode: 'free', floor: innerHeight - 20 });
}
