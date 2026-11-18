// Nematode, drawn as a banded tube along a curved spine so he can bend, squash and wiggle.
// pose: { x, ground, scale (px per body length), face (1 right, -1 left),
//         phase, wave, curl, stretch, hop, mouth, rot (radians) }
const NEMA_COLORS = { light: '#a99b63', dark: '#86732c', line: '#efd99b', mouth: '#4a4519',
                      shade: 'rgba(60, 48, 0, .3)' }; // cel shadow (flat, no shine)
const NEMA_BANDS = [[0, .16, 'light'], [.16, .3, 'dark'], [.3, .42, 'light'], [.42, .54, 'dark'],
                    [.54, .87, 'light'], [.87, .89, 'dark'], [.89, .905, 'light'], [.905, .925, 'dark'], [.925, 1, 'light']];
const nemaEase = (a, b, s) => { const k = Math.min(1, Math.max(0, (s - a) / (b - a))); return k * k * (3 - 2 * k); };

function drawNematode(ctx, p) {
  const N = 120, S = p.scale, face = p.face ?? 1, curl = p.curl ?? 1, st = p.stretch ?? 1;
  const wave = p.wave ?? 0, ph = p.phase ?? 0, C = NEMA_COLORS;

  // Spine from tail (s=0) to head (s=1), model space with y up. Bends into a ")" facing right.
  const pts = [], T = [], W = [];
  let x = 0, y = 0;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = 0.58 + 1.42 * nemaEase(0, .8, s) * curl + wave * Math.sin(2 * Math.PI * (1.2 * s - ph));
    const t = [Math.cos(th), Math.sin(th)];
    if (i) { x += t[0] * st / N; y += t[1] * st / N; }
    pts.push([x, y]); T.push(t);
    W.push(0.23 * (0.72 + 0.28 * Math.min(1, s / 0.4)) / Math.sqrt(st));
  }
  const idx = s => Math.round(s * N);
  const off = (i, v) => [pts[i][0] + T[i][1] * v, pts[i][1] - T[i][0] * v]; // v > 0 = front side
  const offAt = (s, v) => { // off() at a fractional spine position, for smooth face details
    const u = Math.min(N - 1e-9, Math.max(0, s * N)), i = Math.floor(u), f = u - i, g = 1 - f;
    const P = [pts[i][0] * g + pts[i + 1][0] * f, pts[i][1] * g + pts[i + 1][1] * f];
    const t = [T[i][0] * g + T[i + 1][0] * f, T[i][1] * g + T[i + 1][1] * f], w = (W[i] * g + W[i + 1] * f) * v;
    return [P[0] + t[1] * w, P[1] - t[0] * w];
  };
  const R = pts.map((_, i) => off(i, W[i] / 2)), L = pts.map((_, i) => off(i, -W[i] / 2));
  const cap = (i, dir) => {
    const out = [], [c, t, r] = [pts[i], T[i], W[i] / 2];
    for (let k = 0; k <= 12; k++) {
      const a = -Math.PI / 2 + Math.PI * k / 12, ca = Math.cos(a) * dir, sa = Math.sin(a) * dir;
      out.push([c[0] + r * (ca * t[0] - sa * t[1]), c[1] + r * (ca * t[1] + sa * t[0])]);
    }
    return out;
  };
  const band = (s0, s1) => {
    const i0 = idx(s0), i1 = idx(s1);
    return [...R.slice(i0, i1 + 1), ...(i1 === N ? cap(N, 1) : []),
            ...L.slice(i0, i1 + 1).reverse(), ...(i0 === 0 ? cap(0, -1) : [])];
  };

  // Map to screen: feet on the ground, centered on x, mirrored when facing left, spun by rot around his middle.
  const body = band(0, 1);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [a, b] of body) {
    minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b);
  }
  const cx = (minX + maxX) / 2, half = (maxY - minY) * S / 2, mid = p.ground - (p.hop || 0) - half;
  const cr = Math.cos(p.rot || 0), sr = Math.sin(p.rot || 0);
  const map = ([a, b]) => {
    const X = face * (a - cx) * S, Y = half - (b - minY) * S;
    return [p.x + X * cr - Y * sr, mid + X * sr + Y * cr];
  };
  const path = (poly, open) => {
    ctx.beginPath();
    poly.forEach((q, k) => { const [X, Y] = map(q); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    if (!open) ctx.closePath();
  };
  const hit = new Path2D();
  body.forEach((q, k) => { const [X, Y] = map(q); k ? hit.lineTo(X, Y) : hit.moveTo(X, Y); });

  ctx.save();
  ctx.lineJoin = ctx.lineCap = 'round';
  path(body); ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(3, 0.05 * S); ctx.stroke();
  ctx.fillStyle = C.dark; ctx.fill();
  for (const [s0, s1, c] of NEMA_BANDS) { path(band(s0, s1)); ctx.fillStyle = C[c]; ctx.fill(); }

  // Cel shading: one flat, hard-edged shadow band down his back side that darkens every stripe evenly.
  // No highlights or shine.
  // The band runs past both ends; clipping to his outline rounds it off with his head and tail.
  const ext = (i, d, v) => [off(i, v)[0] + T[i][0] * d, off(i, v)[1] + T[i][1] * d];
  const outer = [ext(0, -W[0], -W[0]), ...pts.map((_, i) => off(i, -W[i])), ext(N, W[N], -W[N])];
  const inner = [ext(0, -W[0], -W[0] * .2), ...pts.map((_, i) => off(i, -W[i] * .2)), ext(N, W[N], -W[N] * .2)];
  ctx.save(); path(body); ctx.clip();
  path([...outer, ...inner.reverse()]); ctx.fillStyle = C.shade; ctx.fill();
  ctx.restore();

  // Mouth: a big squarish dark opening tucked right under the lip (superellipse in spine space).
  const open = Math.min(1.2, p.mouth ?? 1), mouth = [];
  for (let k = 0; k < 48; k++) {
    const a = 2 * Math.PI * k / 48, c = Math.cos(a), d = Math.sin(a);
    const ms = .675 + .12 * Math.sign(d) * Math.abs(d) ** .45;
    const mv = .1 + .3 * Math.sign(c) * Math.abs(c) ** .45 * (c > 0 ? open : 1);
    mouth.push(offAt(ms, mv));
  }
  path(mouth); ctx.fillStyle = C.mouth; ctx.fill();

  // Lip: a pointed brim that juts past the front edge and sweeps across the face.
    const at = offAt, lip = [at(.87, .5), at(.84, .6), at(.808, .86), at(.796, .66), at(.795, .35), at(.8, .05), at(.81, -.25), at(.822, -.44)];
  path([...lip, at(.82, -.5), at(.865, -.5)]); ctx.fillStyle = C.light; ctx.fill();
  path(lip, true); ctx.lineWidth = Math.max(2, 0.03 * S); ctx.strokeStyle = C.line; ctx.stroke();
  ctx.restore();
  return hit; // body outline in screen space, for hit-testing
}

// As an overlay character (see src/overlay.js for the contract).
if (typeof CHARACTERS !== 'undefined') CHARACTERS.nematode = {
  name: 'Nematode', width: 40, height: 64, dust: '#b9a35e',
  // Inchworm gait: each ripple up the body surges him forward.
  gait: { hz: 3.2, pace: phase => .45 + .85 * Math.max(0, Math.sin(2 * Math.PI * phase)) },
  draw(ctx, at, m) {
    const p = { x: at.x, ground: at.ground - m.hop, scale: 64 * (at.zoom ?? 1), face: at.face, rot: at.rot, stretch: m.stretch };
    const surge = Math.sin(2 * Math.PI * m.phase);
    if (m.state === 'walk') Object.assign(p, { phase: m.phase, wave: .16, curl: 1 - .12 * surge,
      stretch: 1 + .06 * surge, hop: 3 * Math.max(0, surge), ground: at.ground, mouth: .8 + .2 * surge });
    else if (m.state === 'held') Object.assign(p, { phase: m.phase, wave: .3, curl: 1.15, mouth: 1.2 }); // wriggling
    else if (m.state === 'idle') { const b = Math.sin(m.t * 3); Object.assign(p, { curl: 1 + .05 * b, stretch: 1 + .02 * b }); }
    else Object.assign(p, { // stomp, leap, fly: curls up winding up and on impact, tucks in mid-air
      curl: 1 + .3 * m.crouch + .25 * m.impact - (m.airborne ? .12 : 0),
      mouth: 1 - .3 * m.crouch + .2 * m.impact + (m.airborne ? .1 : 0) });
    return drawNematode(ctx, p);
  },
};
