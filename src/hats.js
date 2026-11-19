// Small, continuous pen curves; flat colors and one hard shadow, like the characters.
const HATS = {
  none: { name: 'No hat', parts: [] },
  beret: { name: 'Pink beret', parts: [
    ['M-15 0C-19-5-15-13-5-15C3-20 16-15 18-9C20-4 12 0 7 0Z', '#edacc6'],
    ['M-14-2Q-2 0 13-3L11 2Q-2 4-14 1Z', '#cd7fa2'],
    ['M1-15Q0-19 4-20', null],
  ] },
  cap: { name: 'Blue baseball cap', ink: '#173b78', parts: [
    ['M-15-1C-16-11-9-20 1-19C12-19 17-10 15-1Z', '#3975d5'],
    ['M3-19C12-17 17-10 15-1L7 0Q10-13 3-19Z', '#2451a1'],
    ['M-14-2Q0-4 14-2Q24-3 29 2Q30 6 21 6L5 2Q-7 4-14 1Z', '#3268c3'],
    ['M-2-19Q1-22 4-19', '#2451a1'],
  ] },
  beanie: { name: 'Cloud beanie', parts: [
    ['M-13-2C-14-22 12-23 14-2Z', '#f7e4c4'],
    ['M6-17Q15-12 14-2L7-2Q10-11 6-17Z', '#dcc49f'],
    ['M-15-5Q0-3 15-5L15 2Q0 5-15 2Z', '#efd5b2'],
    ['M-7-3L-7 1M-2-3L-2 2M3-3L3 2M8-3L8 1', null],
    ['M-5-20Q-8-24-4-26Q-1-29 2-26Q7-27 7-23Q9-19 4-18Q0-15-3-18Q-6-17-5-20Z', '#fff4de'],
  ] },
  sunhat: { name: 'Ribbon sun hat', parts: [
    ['M-14-2Q-13-13-8-18Q1-22 11-17Q15-11 15-2Z', '#f4dfac'],
    ['M7-19Q15-16 15-2L8-1Q11-11 7-19Z', '#dbc18a'],
    ['M-14-7Q0-3 14-7L15-1Q0 3-15-1Z', '#e7a0ba'],
    ['M-14-2C-23-3-36 0-35 5C-32 13-14 9-3 10C12 14 35 12 36 5Q36 0 15-2Q1 5-14-2Z', '#f4dfac'],
    ['M-33 6Q-13 8-2 7Q18 12 34 6Q31 14 8 11Q-12 8-25 10Q-32 9-33 6Z', '#dbc18a'],
    ['M11-3Q7-11 3-7Q1-1 11-3Q19-10 20-5Q21 0 11-3Z', '#e7a0ba'],
    ['M11-3Q12 4 18 7M11-3Q6 2 7 5', null],
  ] },
};
function drawHat(ctx, id) {
  const hit = new Path2D();
  ctx.save(); ctx.lineJoin = ctx.lineCap = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = HATS[id]?.ink || '#654a42';
  for (const [d, fill] of HATS[id]?.parts || []) {
    const path = new Path2D(d);
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); hit.addPath(path); }
    ctx.stroke(path);
  }
  ctx.restore();
  return hit;
}
