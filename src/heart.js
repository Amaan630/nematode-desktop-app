// A cel-shaded heart (flat fill, one hard shadow, bold outline, one glint), centered on (x, y), `size` px wide.
const HEART_COLORS = { fill: '#ff5c8a', shade: '#e0316c', line: '#6e1534', glint: '#ffd6e3' };
const GOLD_HEART_COLORS = { fill: '#ffcf50', shade: '#e5a52b', line: '#8b591d', glint: '#fff3be' };
const HEART = (() => {
  const p = new Path2D();
  p.moveTo(0, -.2);
  p.bezierCurveTo(0, -.45, -.5, -.45, -.5, -.12);
  p.bezierCurveTo(-.5, .15, -.2, .3, 0, .48);
  p.bezierCurveTo(.2, .3, .5, .15, .5, -.12);
  p.bezierCurveTo(.5, -.45, 0, -.45, 0, -.2);
  return p;
})();

function drawHeart(ctx, x, y, size, rot = 0, C = HEART_COLORS) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(size, size);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.fillStyle = C.shade; ctx.fill(HEART);
  // The lit part is the heart nudged up-left; what's left uncovered at the bottom right is the shadow.
  ctx.save(); ctx.clip(HEART); ctx.translate(-.07, -.08); ctx.fillStyle = C.fill; ctx.fill(HEART); ctx.restore();
  ctx.lineWidth = .075; ctx.strokeStyle = C.line; ctx.stroke(HEART);
  ctx.beginPath(); ctx.arc(-.24, -.14, .11, Math.PI * 1.05, Math.PI * 1.55); // glint on the left lobe
  ctx.lineWidth = .065; ctx.strokeStyle = C.glint; ctx.stroke();
  ctx.restore();
}

// Shared click/gesture animation: size, spring, travel and fade are identical in previews.
function drawHeartEffect(ctx, h) {
  if (h.t < 0 || h.t >= 1.8) return;
  const u = Math.min(1, h.t / .8);
  ctx.save();
  const pop = h.t < .25 ? 1 + .25 * Math.sin(Math.PI * h.t / .25) : 1; // overshoots, then settles
  const grow = Math.min(1, h.t / .12), rise = 70 * h.t + 25 * h.t * h.t;
  ctx.globalAlpha = Math.min(1, (1.8 - h.t) / .5);
  const x = h.toX === null ? h.x : h.x + (h.toX - h.x) * (u * u * (3 - 2 * u));
  drawHeart(ctx, x + h.dir * 12 * Math.sin(2.6 * h.t + h.sway) - h.dir * 12 * Math.sin(h.sway), h.y - rise,
            26 * grow * pop, .18 * Math.sin(2.6 * h.t + h.sway + 1), h.colors);
  ctx.restore();
}
