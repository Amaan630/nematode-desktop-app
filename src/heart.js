// A cel-shaded heart (flat fill, one hard shadow, bold outline, one glint), centered on (x, y), `size` px wide.
const HEART_COLORS = { fill: '#ff5c8a', shade: '#e0316c', line: '#6e1534', glint: '#ffd6e3' };
const HEART = (() => {
  const p = new Path2D();
  p.moveTo(0, -.2);
  p.bezierCurveTo(0, -.45, -.5, -.45, -.5, -.12);
  p.bezierCurveTo(-.5, .15, -.2, .3, 0, .48);
  p.bezierCurveTo(.2, .3, .5, .15, .5, -.12);
  p.bezierCurveTo(.5, -.45, 0, -.45, 0, -.2);
  return p;
})();

function drawHeart(ctx, x, y, size, rot = 0) {
  const C = HEART_COLORS;
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
