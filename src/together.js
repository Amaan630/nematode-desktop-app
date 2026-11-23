// The visiting character and its rope. Characters still draw themselves through the usual adapter.
class Together {
  constructor(actors = new Actors()) { this.actors = actors; this.active = false; this.guest = null; this.mode = "together"; }

  join(character, id = "preview-peer", mode = "together", presentation = null) {
    const changed=this.mode!==mode;
    this.mode = mode;
    if(changed && this.presentation) {this.presentation.exiting=true;this.presentation.returning=mode!=='solo';this.nextPresentation=presentation;}
    if (this.active && this.guest.id === id) {
      const current = this.guest.character;
      if (current.appearance && current.appearance.character === character.appearance?.character) current.appearance = character.appearance;
      else this.guest.character = character.create?.() || character;
      if(changed && presentation && !this.presentation) this.presentation=presentation(this.guest);
      return;
    }
    if (this.guest) this.actors.release(this.guest, 'scene');
    this.active = true;
    this.guest = this.actors.acquire(id, character, 'scene');
    const alreadyHere = this.guest.visible;
    Object.assign(this.guest, { x: this.guest.x ?? -character.width, t: alreadyHere ? 2 : 0,
      phase: 0, waiting: !alreadyHere, leaving: false });
    if(presentation) this.presentation=presentation(this.guest);
  }

  separate() {
    this.active = false;
    if(this.presentation) {this.presentation.exiting=true;this.presentation.returning=false;this.nextPresentation=null;}
    if (this.guest) { this.guest.leaving = true; this.guest.t = 0; }
  }

  get locksInput() { return !this.presentation && this.active && !this.guest?.waiting && this.guest?.t < 2; }

  draw(ctx, at, owner, visible) {
    const g = this.guest;
    if (!g) return;
    if (!visible) { g.visible = false; if (!this.active) { this.actors.release(g, 'scene'); this.guest = null; } return; }
    if (g.waiting && !g.leaving) {
      if (!at.settled) return; // let the resident arrive before casting the rope
      g.waiting = false;
    }
    if(this.presentation) {
      const hit=this.presentation.draw(ctx,at,owner,g,matchMedia('(prefers-reduced-motion: reduce)').matches);
      if(this.presentation.done){this.presentation=this.active&&this.nextPresentation?this.nextPresentation(g):null;this.nextPresentation=null;g.t=2;g.ready=false;}
      return hit;
    }
    const dt = at.dt, c = g.character;
    g.t += dt;
    g.y ??= at.ground;
    const gap = (owner.width + c.width) / 2 + 50;
    const target = at.x >= gap + c.width / 2 ? at.x - gap : at.x + gap;
    const oldX = g.x, oldY = g.y;
    if (g.leaving) g.x -= 210 * dt;
    else if (g.t > .65 && g.t < 2) {
      const u = Math.min(1, (g.t - .65) / 1.35), ease = u * u * (3 - 2 * u);
      g.x = -c.width + (target + c.width) * ease;
      g.y = at.ground;
    } else if (g.t >= 2) {
      g.x += (target - g.x) * Math.min(1, dt * 8);
      g.y += (at.ground - g.y) * Math.min(1, dt * 8);
    }
    if (g.leaving && g.x < -c.width) { this.actors.release(g, 'scene'); g.visible = false; this.guest = null; return; }
    const moving = Math.abs(g.x - oldX) > .15 || Math.abs(g.y - oldY) > .15;
    g.phase = (g.phase + (moving ? dt * c.gait.hz : 0)) % 1;
    g.ready = g.t >= 2 && !g.leaving;
    g.poseHeight = c.height;
    if (!g.leaving || g.t < .35) {
      ctx.save();
      ctx.globalAlpha = g.leaving ? 1 - g.t / .35 : 1;
      const end = g.t < .65 && !g.leaving ? at.x + (-c.width - at.x) * Math.min(1, g.t / .65) : g.x;
      drawRope(ctx, at.x, at.ground - owner.height * .4, end, g.y - c.height * .4, g.t < .65);
      ctx.restore();
    }
    if (g.t < .65 && !g.leaving) return;
    g.visible = true;
    c.draw(ctx, { ...at, x: g.x, ground: g.y, face: moving ? Math.sign(g.x - oldX) || 1 : Math.sign(at.x - g.x) || 1,
      rot: 0, accel: [0, 0] }, { state: moving ? 'walk' : 'idle', phase: g.phase, t: g.t,
      stretch: 1, hop: 0, crouch: 0, impact: 0, airborne: false });
  }
}

// Sample a curved cord with a fixed, gentle wobble, like the installer's hand-drawn marker arrow.
// The wobble is tied to the curve, not time, so a resting rope doesn't shimmer.
function drawRope(ctx, x, y, endX, endY, casting = false) {
  const mid = (x + endX) / 2, knotY = (y + endY) / 2 + 6;
  const curves = [
    [[x, y], [x + (mid - x) * .4, y + 16], [mid - 12, knotY - 3], [mid, knotY]],
    [[mid, knotY], [mid + 36, knotY + 21], [mid + 26, knotY - 29], [mid, knotY]],
    [[mid, knotY], [mid - 32, knotY - 25], [mid - 25, knotY + 24], [mid, knotY]],
    [[mid, knotY], [mid + 14, knotY + 9], [endX + (mid - endX) * .4, endY + 15], [endX, endY]],
    [[mid - 2, knotY + 2], [mid - 7, knotY + 8], [mid - 8, knotY + 16], [mid - 17, knotY + 19]],
    [[mid + 2, knotY + 2], [mid + 5, knotY + 9], [mid + 11, knotY + 12], [mid + 18, knotY + 14]],
  ];
  ctx.save();
  ctx.strokeStyle = '#cf3954'; ctx.lineCap = ctx.lineJoin = 'round';
  curves.forEach(([a, b, c, d], j) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + Math.hypot(d[0] - c[0], d[1] - c[1]);
    const steps = Math.max(12, Math.ceil(length / 4));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const px = u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0];
      const py = u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1];
      const wobble = Math.sin(t * length * .17 + j) * .7 * Math.sin(Math.PI * t);
      i ? ctx.lineTo(px + wobble * .4, py + wobble) : ctx.moveTo(px, py);
    }
    ctx.lineWidth = 3.6 + Math.sin(j * 2) * .45;
    ctx.stroke();
  });
  if (casting) { ctx.beginPath(); ctx.ellipse(endX, endY, 24, 15, -.3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
