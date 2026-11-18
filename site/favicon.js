// The site's tab icon: a character's silhouette in dark pink on a light pink tile (the site's palette).
// Used live by site/index.html (follows the character toggle) and by scripts/favicon.html, which the Pages
// deploy screenshots into the fixed favicon.png and apple-touch-icon.png.
// Needs CHARACTERS (src/characters/*.js) loaded.
function faviconCanvas(id, size = 64, rounded = true, fill = .64) {
  const ch = CHARACTERS[id], idle = { state: 'idle', phase: 0, t: 0, stretch: 1, hop: 0, crouch: 0, impact: 0, airborne: false };
  // Draw big, then measure his real outline so every character gets the same even padding.
  const big = document.createElement('canvas'), bx = big.getContext('2d', { willReadFrequently: true });
  big.width = big.height = 512;
  ch.draw(bx, { x: 256, ground: 400, face: 1, rot: 0, accel: [0, 0], dt: 1 / 60, now: 1000, zoom: 3 }, idle);
  const a = bx.getImageData(0, 0, 512, 512).data;
  let x0 = 512, y0 = 512, x1 = 0, y1 = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (a[(y * 512 + x) * 4 + 3] > 90) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = size * fill / Math.max(w, h);
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
  c.width = c.height = size;
  x.drawImage(big, x0, y0, w, h, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
  const img = x.getImageData(0, 0, size, size), d = img.data; // drop faint pixels (soft ground shadows), keep smooth edges
  for (let i = 3; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, (d[i] - 70) * 2.2));
  x.putImageData(img, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#c2185b'; x.fillRect(0, 0, size, size);   // silhouette
  x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#ffc9d9';                           // tile behind it
  x.beginPath(); x.roundRect(0, 0, size, size, rounded ? size * .22 : 0); x.fill();
  return c;
}
