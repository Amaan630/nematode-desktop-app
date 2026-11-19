// A little marker-drawn note: the outline writes itself, then the lettering springs into place.
function drawSpeech(ctx, text, x, y, t, reduced = false) {
  ctx.save(); ctx.font = '20px "Lilita One", sans-serif';
  const half = Math.max(60, ctx.measureText(text).width / 2 + 16);
  x = Math.max(half + 18, Math.min(innerWidth - half - 18, x));
  y = Math.max(40, Math.min(innerHeight - 52, y));
  const float = reduced ? 0 : Math.max(0, t - .6);
  y -= 22 * float + 9 * float * float;
  const spring = reduced ? 1 : 1 - Math.exp(-11 * t) * Math.cos(17 * t);
  ctx.globalAlpha = Math.min(1, t * 10, (3.6 - t) * 3);
  ctx.translate(x, y + 34); ctx.scale(spring, spring); ctx.rotate(reduced ? 0 : -.035 + .06 * Math.exp(-5 * t)); ctx.translate(0, -34);
  const outline = new Path2D();
  outline.moveTo(-half + 7, -25);
  outline.bezierCurveTo(-half - 6, -12, -half - 3, 7, -half + 2, 17);
  outline.quadraticCurveTo(-half + 12, 23, -18, 20);
  outline.lineTo(-27, 35); outline.quadraticCurveTo(-12, 30, -4, 22);
  outline.bezierCurveTo(18, 24, half - 7, 24, half, 14);
  outline.quadraticCurveTo(half + 6, -5, half - 3, -23);
  outline.bezierCurveTo(half - 28, -27, -20, -29, -half + 7, -25);
  outline.closePath();
  ctx.fillStyle = '#fff9eb'; ctx.fill(outline);
  ctx.strokeStyle = '#c57a88'; ctx.lineWidth = 2.2; ctx.lineJoin = ctx.lineCap = 'round';
  const perimeter = half * 4 + 130;
  ctx.setLineDash([perimeter]); ctx.lineDashOffset = reduced ? 0 : perimeter * (1 - Math.min(1, t / .4));
  ctx.stroke(outline); ctx.setLineDash([]);
  ctx.save(); ctx.globalAlpha *= reduced ? 1 : Math.min(1, Math.max(0, (t - .12) * 6));
  ctx.fillStyle = '#85324e'; ctx.textAlign = 'center'; ctx.fillText(text, 0, 6); ctx.restore();
  if (!reduced && t < .7) {
    const reach = 4 + 8 * Math.sin(Math.PI * Math.min(1, t / .7));
    ctx.globalAlpha *= Math.max(0, 1 - t / .7); ctx.strokeStyle = '#d27b92';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * (half + 10), -15); ctx.lineTo(side * (half + 10 + reach), -21);
      ctx.moveTo(side * (half + 11), 0); ctx.lineTo(side * (half + 13 + reach), 1); ctx.stroke();
    }
  }
  ctx.restore();
}
