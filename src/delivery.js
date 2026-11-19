// A received gesture is carried by its sender's character. One visit at a time, without a rope.
class Delivery {
  constructor(give) { this.give = give; this.queue = []; this.guest = null; }
  get active() { return !!this.guest || this.queue.length > 0; }
  enqueue(character, action, complete = () => {}) { this.queue.push({ character, action, complete }); }

  draw(ctx, at, owner) {
    if (!this.guest && this.queue.length) {
      const { character, action, complete } = this.queue.shift();
      this.guest = { complete, character: character.create?.() || character, action, x: -character.width,
        y: at.ground, phase: 0, state: 'arrive', t: 0 };
    }
    const g = this.guest;
    if (!g) return;
    const c = g.character, gap = (owner.width + c.width) / 2 + 28;
    const destination = at.x >= gap + c.width / 2 ? at.x - gap : at.x + gap;
    const target = g.state === 'leave' ? -c.width - 1 : destination;
    const walking = g.state !== 'give';
    if (walking) {
      g.phase = (g.phase + at.dt * c.gait.hz) % 1;
      const distance = target - g.x, speed = 260 * c.gait.pace(g.phase);
      g.x += Math.sign(distance) * Math.min(Math.abs(distance), speed * at.dt);
    }
    g.y += (at.ground - g.y) * Math.min(1, at.dt * 10);
    if (g.state === 'arrive' && Math.abs(g.x - target) < 1 && Math.abs(g.y - at.ground) < 2) {
      g.state = 'give'; g.t = 0; this.give(g.action, { x: g.x, y: g.y - c.height - 8 });
    }
    if (g.state === 'give' && (g.t += at.dt) > 2) g.state = 'leave';
    if (g.state === 'leave' && g.x <= -c.width) { this.guest = null; g.complete(); return; }
    c.draw(ctx, { ...at, x: g.x, ground: g.y, face: g.state === 'leave' ? -1 : Math.sign(at.x - g.x) || 1,
      rot: 0, accel: [0, 0] }, { state: walking ? 'walk' : 'idle', phase: g.phase, t: g.t,
      stretch: 1, hop: 0, crouch: 0, impact: 0, airborne: false });
  }
}
