// Croissant. Drawing: drawCroissant() (also used for menu previews). Overlay character: bottom of file.
// Flat 2D cel-shaded: solid fills, one hard-edged shadow per shape,
// a flat glint, bold outlines. Seven layers on a drooping crescent, stubby legs he waddles on.
// pose: { x, ground, scale (px per unit; ~1.4 units wide, ~0.8 tall), face (1 right, -1 left),
//         phase (walk cycle 0..1), walk (0 standing .. 1 waddling), squash, rot, blink,
//         jiggle: [left, right] extra droop of each end in radians (from CroissantJiggle) }
// Returns his outline in screen space, for hit-testing.
const CROISSANT_INK = {
  outline: '#5c3415', base: '#f2b65a', tip: '#e6a04a', shade: '#c97d32', glint: '#fff0c4',
  leg: '#7a4a31', legShade: '#55311f', eye: '#2a170d', cheek: '#f4a08c',
};

function drawCroissant(ctx, p) {
  const canvasTransform = ctx.getTransform();
  const C = CROISSANT_INK, S = p.scale, f = p.face ?? 1, walk = p.walk ?? 0, ph = p.phase ?? 0, sq = p.squash ?? 0;
  const [jl, jr] = p.jiggle ?? [0, 0], OUT = .024, settle = p.settle || 0;
  const LEG = p.settle !== undefined ? .17-.115*settle : p.seated ? .055 : .17, wave = Math.sin(2 * Math.PI * ph);
  const lift = [Math.max(0, wave), Math.max(0, -wave)].map(v => .07 * walk * v); // left, right boot
  const rock = .08 * walk * wave, hipY = -LEG - .025 * walk * Math.abs(wave);

  // A shape with a hard cel shadow: fill shadow, then base offset up-left, leaving a shadow crescent bottom-right.
  const cel = (shape, base, shade, dx, dy) => {
    ctx.save(); ctx.clip(shape);
    ctx.fillStyle = shade; ctx.fill(shape);
    ctx.translate(dx, dy); ctx.fillStyle = base; ctx.fill(shape);
    ctx.restore();
  };

  ctx.save();
  ctx.translate(p.x, p.ground);
  ctx.fillStyle = 'rgba(40,20,5,.16)';
  ctx.beginPath(); ctx.ellipse(0, 0, .48 * S, .055 * S, 0, 0, 7); ctx.fill();
  ctx.scale(f * S * (1 + .6 * sq), S * (1 - sq));
  ctx.translate(0, hipY); ctx.rotate(p.rot ?? 0); ctx.translate(0, -hipY);
  ctx.lineJoin = ctx.lineCap = 'round';

  // --- Legs: short and stubby, each boot lifts and steps forward in turn ---
  if (p.seated && p.settle === undefined) {
    for (const side of [-1,1]) {
      const foot = new Path2D(); foot.ellipse(side*.19, -.01, .12, .052, side*.25, 0, 7);
      ctx.lineWidth=OUT;ctx.strokeStyle=C.outline;ctx.stroke(foot);
      cel(foot,C.leg,C.legShade,-.02,-.01);
    }
  } else [-1, 1].forEach((side, i) => {
    const up = lift[i], fwd = .4 * up, hx = side * (.085+.105*settle) + fwd / 2;
    const leg = new Path2D(); leg.roundRect(hx - .05, hipY - .04, .1, LEG - up + .02, .05);
    const boot = new Path2D(); boot.ellipse(hx + fwd / 2 + .02*(1-settle), -up - .045+.035*settle, .08+.04*settle, .048+.004*settle, side*.25*settle, 0, 7);
    for (const shape of [leg, boot]) {
      ctx.lineWidth = OUT; ctx.strokeStyle = C.outline; ctx.stroke(shape);
      cel(shape, C.leg, C.legShade, -.03+.01*settle, -.015+.005*settle);
    }
  });

  // --- Body: rocks on its hips; the ends jiggle ---
  ctx.translate(0, hipY); ctx.rotate(rock); ctx.translate(0, -hipY);
  const O = [0, hipY + .32], R = .62;
  // angle (deg from top), half-size along the crescent, half-size across it; outer layers first.
  const layers = [[-62, .14, .1], [62, .14, .1], [-44, .17, .19], [44, .17, .19],
                  [-23, .21, .24], [23, .21, .24], [0, .27, .265]];
  const shapes = layers.map(([deg, rx, ry]) => {
    const w = (deg < 0 ? jl : jr) * (Math.abs(deg) / 62) ** 1.6; // outer layers swing most
    const a = deg * Math.PI / 180 + Math.sign(deg) * w;
    const m = new DOMMatrix().translate(O[0] + R * Math.sin(a), O[1] - R * Math.cos(a)).rotate(a * 180 / Math.PI);
    const e = new Path2D(); e.ellipse(0, 0, rx, ry, 0, 0, 7);
    const shape = new Path2D(); shape.addPath(e, m);
    return { shape, deg, rx, ry, m };
  });
  ctx.lineWidth = OUT * 2; ctx.strokeStyle = C.outline;
  for (const s of shapes) ctx.stroke(s.shape);   // bold outer silhouette
  for (const { shape, deg, rx, ry, m } of shapes) {
    cel(shape, Math.abs(deg) > 55 ? C.tip : C.base, C.shade, -.16 * rx, -.24 * ry);
    ctx.save(); ctx.setTransform(ctx.getTransform().multiply(m));
    ctx.strokeStyle = C.glint; ctx.lineWidth = .022;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * .62, ry * .62, 0, Math.PI * 1.15, Math.PI * 1.42); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = OUT; ctx.strokeStyle = C.outline; ctx.stroke(shape);
  }

  // --- Face on the front layer, glancing the way he's heading ---
  const fy = O[1] - R + .04, look = .025, blink = p.blink ?? 0;
  for (const s of [-1, 1]) {
    ctx.fillStyle = C.cheek;
    ctx.beginPath(); ctx.ellipse(look + s * .16, fy + .04, .036, .02, 0, 0, 7); ctx.fill();
    if (blink > .5) {
      ctx.strokeStyle = C.eye; ctx.lineWidth = .014;
      ctx.beginPath(); ctx.arc(look + s * .085, fy - .03, .022, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
    } else {
      ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(look + s * .085, fy - .02, .024, .03, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(look + s * .085 + .008, fy - .03, .008, 0, 7); ctx.fill();
    }
  }
  ctx.strokeStyle = C.eye; ctx.lineWidth = .016;
  ctx.beginPath(); ctx.arc(look, fy + .015, .042, .18 * Math.PI, .82 * Math.PI); ctx.stroke();
  let hat;
  if (p.hat && typeof drawHat === 'function') {
    ctx.save(); ctx.translate(0, O[1] - R - .23); ctx.scale(.017, .017);
    hat = new Path2D(); hat.addPath(drawHat(ctx, p.hat), canvasTransform.inverse().multiply(ctx.getTransform())); ctx.restore();
  }
  ctx.restore();

  const hit = new Path2D(); // roughly his body, in screen space
  hit.ellipse(p.x, p.ground - .42 * S, .72 * S, .45 * S, 0, 0, 7, f < 0);
  if (hat) hit.addPath(hat);
  return hit;
}

// Springy ends: feed it his on-screen acceleration each frame, read .angles for pose.jiggle.
// Moving up (or stopping a fall) makes both ends droop; sideways makes the trailing end lag.
// Only movement moves them: holding him still leaves them still.
class CroissantJiggle {
  constructor(stiffness = 260, damping = 12) { this.k = stiffness; this.c = damping; this.angles = [0, 0]; this.vel = [0, 0]; }
  step(dt, ax, ay, scale) {           // ax, ay in px/s², scale in px per unit
    const push = [(-ay + ax) / scale, (-ay - ax) / scale].map(v => (Number.isFinite(v) ? v : 0));
    for (let i = 0; i < 2; i++) {
      const acc = -this.k * this.angles[i] - this.c * this.vel[i] + .22 * push[i];
      this.vel[i] += acc * dt;
      this.angles[i] = Math.max(-.45, Math.min(.45, this.angles[i] + this.vel[i] * dt));
    }
    return this.angles;
  }
}

// As an overlay character (see src/overlay.js for the contract).
if (typeof CHARACTERS !== 'undefined') CHARACTERS.croissant = {
  name: 'Croissant', width: 100, height: 58, seated: {width:100,height:58}, dust: '#d9964d', // golden crumbs
  gait: { hz: 2.2, pace: () => .75 },                          // steady waddle
  jiggle: new CroissantJiggle(),
  create() { return { ...this, jiggle: new CroissantJiggle() }; }, // each visitor gets its own springs
  draw(ctx, at, m) {
    const transition=m.sit>0 && m.sit<1;
    const settle=transition?m.sit:undefined;
    const seated=['sit','cuddle'].includes(m.state) && m.sit!==0;
    return drawCroissant(ctx, {
      x: at.x, ground: at.ground - m.hop, hat: at.appearance?.accessories?.hat || at.hat, scale: 70 * (at.zoom ?? 1), face: at.face, rot: at.rot,
      walk: m.state === 'walk' ? 1 : 0, phase: m.phase,
      seated, settle,
      squash: 1 - m.stretch, blink: m.state === 'cuddle' && m.cuddle > .4 ? 1 : (at.now / 1000) % 3.7 < .12 ? 1 : 0,
      jiggle: transition ? [-.28*settle,-.12*settle] : seated ? [-.28,-.12] : this.jiggle.step(at.dt, at.accel[0] * at.face, at.accel[1], 70),
    });
  },
};
