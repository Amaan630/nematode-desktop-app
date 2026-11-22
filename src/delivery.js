// A received gesture is carried by its sender's character. One visit at a time, without a rope.
class Delivery {
  constructor(give, actors = new Actors()) { this.give = give; this.actors = actors; this.queue = []; this.guest = null; }
  get active() { return !!this.guest || this.queue.length > 0; }
  enqueue(character, action, complete = () => {}, id = "preview-sender") { this.queue.push({ character, action, complete, id }); }

  draw(ctx, at, owner) {
    if (!this.guest && this.queue.length) {
      const { character, action, complete, id } = this.queue.shift();
      const actor = this.actors.acquire(id, character, 'delivery');
      actor.x ??= -character.width; actor.y ??= at.ground;
      this.guest = { complete, actor, action, phase: 0, state: 'arrive', t: 0, attached: actor.owners.has('scene') };
    }
    const g = this.guest;
    if (!g) return;
    const actor = g.actor, c = actor.character;
    if (actor.owners.has('scene')) {
      g.attached = true;
      if (!actor.visible || !actor.ready) return;
      if (g.state !== 'give') { g.state = 'give'; g.t = 0; this.give(g.action, { x: actor.x, y: actor.y - (actor.poseHeight || c.height) - 8 }); }
      if ((g.t += at.dt) >= 3.6) { this.actors.release(actor, 'delivery'); this.guest = null; g.complete(); }
      return;
    }
    if (g.attached) { g.attached = false; g.state = g.state === 'give' ? 'leave' : 'arrive'; }
    const gap = (owner.width + c.width) / 2 + 28;
    const destination = at.x >= gap + c.width / 2 ? at.x - gap : at.x + gap;
    const target = g.state === 'leave' ? -c.width - 1 : destination;
    const walking = g.state !== 'give';
    if (walking) {
      g.phase = (g.phase + at.dt * c.gait.hz) % 1;
      const distance = target - actor.x, speed = 260 * c.gait.pace(g.phase);
      actor.x += Math.sign(distance) * Math.min(Math.abs(distance), speed * at.dt);
    }
    actor.y += (at.ground - actor.y) * Math.min(1, at.dt * 10);
    if (g.state === 'arrive' && Math.abs(actor.x - target) < 1 && Math.abs(actor.y - at.ground) < 2) {
      g.state = 'give'; g.t = 0; this.give(g.action, { x: actor.x, y: actor.y - c.height - 8 });
    }
    if (g.state === 'give' && (g.t += at.dt) > 2) g.state = 'leave';
    if (g.state === 'leave' && actor.x <= -c.width) { this.actors.release(actor, 'delivery'); actor.visible = false; this.guest = null; g.complete(); return; }
    actor.visible = true; actor.ready = g.state === 'give';
    c.draw(ctx, { ...at, x: actor.x, ground: actor.y, face: g.state === 'leave' ? -1 : Math.sign(at.x - actor.x) || 1,
      rot: 0, accel: [0, 0] }, { state: walking ? 'walk' : 'idle', phase: g.phase, t: g.t,
      stretch: 1, hop: 0, crouch: 0, impact: 0, airborne: false });
  }
}
