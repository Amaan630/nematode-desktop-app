# Visual design

Amaan approved the current visual direction on November 19, 2026. Preserve this look when extending the app:
small, warm, hand-drawn, playful, and readable. The fan's spring was also approved; its temporary blur was not.

## What makes it feel right

Think of a little illustrated note from someone you love. Cream paper, berry lettering, a few rounded marks,
and a small physical gesture do the work. The UI belongs beside the characters, rather than looking like a
settings panel. Keep it light even when the system is dark.

- Use flat fills and rounded, slightly imperfect outlines. No gradients, glass, soft 3D shading or heavy shadows.
- Keep the roughness subtle and stable. A drawn edge can wobble; it shouldn't vibrate while sitting still.
- Use the locally bundled **Lilita One** for gesture labels and speech. It is chunky and rounded, not a thin
  system font or a pixel font. Keep its SIL OFL license with the font in `src/fonts/`.
- Icons should be small drawings, not emoji: a plump golden heart, a pink note with a heart, a red tied bow.
  Use rounded joins, short strokes and simple silhouettes that remain legible at 24 px.
- Keep copy brief. “Send a heart”, “Send I love you”, “Be together”, “Separate”. Wrap a label instead of shrinking it.
- Preserve the character rules in `AGENTS.md`: flat cel shading, dark outlines, no Nematode shine, Croissant's
  small glints and straight stubby legs. The character drawing functions remain the single source of truth.

| Use | Color |
| --- | --- |
| Paper / fan / speech fill | `#fff9eb` |
| Lettering | `#85324e` |
| Sketch outline | `#c57a88` |
| Hover paper | `#ffe0e5` |
| Focus outline | `#a63d60` |
| Sent heart | `#ffcf50`, shadow `#e5a52b`, outline `#8b591d`, glint `#fff3be` |
| Rope | `#cf3954` |

Ordinary click-hearts stay pink. A gold heart specifically means the shared “Send a heart” gesture.

## How the code makes it

### Fan — `src/fan.js`, `src/fan.css`

The fan is a **256 × 148 px SVG**. Its semicircle uses a 120 px outside radius and a 45 px inside radius.
Visible entries from the action registry divide that ring into equal slices; there is no hard-coded three-item
layout. Icons sit at an 87 px radius, and optional `lines` place short labels underneath. Text is 14 px Lilita One.
The fan flips below a character near the screen's top and stays within the screen edges.

The segment outlines use continuous cubic curves with a small, deterministic radial wobble.
No displacement filter: it broke thin strokes into jagged fragments, especially around the inner arc.
Text and icons remain crisp.

The opening lasts 280 ms, anchored at the semicircle's center beside the character. It grows from a small,
squashed shape, overshoots to 1.08 × 1.12, settles through .98 × .96, then rests at full size. Rotation settles
from −6° through 1° and −.5° to zero. Opacity comes in over the first 120 ms.

Use **SVG `animateTransform` on internal groups**, not a CSS transform on the outer SVG. CSS scaling can stretch
a cached raster during the animation in WebKit, leaving the fan blurry until it stops. Internal SVG transforms
let the vector artwork and glyphs redraw at their current size. Reduced motion omits the spring entirely.
Keep hit targets and accessible menu-item names attached to the same groups as their drawings.

### Speech — `src/speech.js`

`drawSpeech` builds an asymmetric `Path2D` with curved corners, uneven top/bottom edges and a little angled tail.
Its width comes from the measured 20 px Lilita One text. It uses the same cream and berry palette as the fan.
A simple stock rounded rectangle loses the illustrated feel; don't replace this path with one.

A shrinking dash offset traces the outline over 400 ms. A damped cosine gives the bubble a brief overshoot;
the lettering fades in after 120 ms, and short accent marks briefly radiate from the sides. The canvas redraws
this every frame, so scaling doesn't stretch a previously rendered text bitmap. It lives for 3.6 seconds. After a 600 ms reading beat, it drifts upward with accelerating rise
(`22u + 9u²` pixels, where `u = t − .6`) while fading out. Reduced motion keeps it stationary.
Reduced motion shows the complete outline and lettering without the spring or accent burst.

### Hearts and receiving — `src/heart.js`, `src/delivery.js`, `src/overlay.js`

Both colors use the same heart path and hard cel shadow. `drawHeart` accepts a palette rather than maintaining
two drawings. The existing quick overshoot, upward drift, sway and fade give it a light, buoyant feel.

A received gesture carries `payload.character`, the sender's choice. `Delivery` uses that character's existing
adapter, walks it in from the side, presents one gesture, waits briefly, and walks it away. The golden heart
moves from the visitor toward the recipient as it rises. A character with mutable animation state supplies
`create()` so the visitor's springs cannot alter the resident's. This is local presentation; the animation queue is in memory, while `connection.js` persists pending gestures and receipts and the
Cloudflare Worker stores undelivered actions. The animation completion callback triggers acknowledgement.
The speech itself still says “I love you”; only the fan action says “Send I love you”.

### Rope — `src/together.js`

The Mac installer's hand-drawn arrow (`scripts/dmg-background.html`) is the reference: a rounded marker stroke
with gentle unevenness. The rope uses cubic curves sampled about every four pixels, a fixed subpixel sine
wobble, and slightly varied stroke widths. This is stable geometry, not random noise regenerated each frame.
The knot uses unequal loops and short tails, so it reads as a tied bow rather than an infinity symbol.

Movement gives the drawing purpose: cast the lasso left, pull in the visitor, then let the rope settle.
Once joined, the resident keeps its normal wandering behavior; the visitor follows and faces its walking direction.
Separate fades the rope and sends the visitor away. Reuse the registered characters rather than drawing copies.

## Checking changes

Render before changing the installed experience. Inspect the fan mid-spring as well as at rest, with the font
loaded, at real size and near screen edges. Check reduced motion, keyboard focus, both characters, speech,
golden delivery and separation. `node tests/social.mjs` covers these behaviors and writes screenshots to temp.
Browser checks do not establish that animation is equally sharp in the native Mac WebKit view or on Windows;
look at the local app too. Do not add unrelated decoration while fixing motion or readability.

For receiving in the local debug app, choose **Debug → Receive a heart / Receive I love you / Receive Be together** from the menu bar menu. It simulates
an incoming gift using a different registered character as its sender; no server is contacted. This item is
absent from release builds. You can also open the browser preview documented in `README.md`.

The fan springs open in 280 ms and folds closed in 180 ms, with a small anticipation bounce. Closing immediately disables interaction; reopening cancels the pending hide. Both animations use internal SVG transforms and respect reduced motion.


Each spring segment uses spline easing so speed changes continuously at the overshoot and return, rather than snapping between linear keyframes.

Fan presses capture the pointer and hit-test its current position, so dragging transfers the active segment. Releasing outside cancels selection. Labels disable text selection, including WebKit.
