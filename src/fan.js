// A segmented semicircle. Each action owns its label and icon; the slice count follows the registry.
class ActionFan {
  constructor(actions, choose, close) {
    this.actions = actions;
    this.choose = choose;
    this.onClose = close;
    this.element = document.createElement('div');
    this.element.className = 'action-fan';
    this.element.hidden = true;
    document.body.append(this.element);
    const hovered = e => {
      const item = document.elementFromPoint(e.clientX, e.clientY)?.closest('[role=menuitem]');
      return item && this.element.contains(item) ? item : null;
    };
    this.element.addEventListener('pointerdown', e => {
      if (!this.open || e.button !== 0 || !hovered(e)) return;
      e.preventDefault();
      document.activeElement?.blur();
      this.pointer = e.pointerId;
      this.element.setPointerCapture(e.pointerId);
      this.element.classList.add('tracking');
      hovered(e).classList.add('active');
    });
    this.element.addEventListener('pointermove', e => {
      if (e.pointerId !== this.pointer) return;
      this.element.querySelector('.active')?.classList.remove('active');
      hovered(e)?.classList.add('active');
    });
    this.element.addEventListener('pointerup', e => {
      if (e.pointerId !== this.pointer) return;
      const item = hovered(e);
      this.endPress();
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    this.element.addEventListener('pointercancel', () => this.endPress());
    this.element.addEventListener('lostpointercapture', () => this.endPress());
    this.element.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      const buttons = [...this.element.querySelectorAll('[role=menuitem]')], i = buttons.indexOf(document.activeElement);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
  }

  endPress() {
    const pointer = this.pointer;
    this.pointer = null;
    this.element.classList.remove('tracking');
    this.element.querySelector('.active')?.classList.remove('active');
    if (pointer != null && this.element.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
  }

  get open() { return !this.element.hidden && !this.element.inert; }

  show(x, top, bottom) {
    this.endPress();
    clearTimeout(this.closeTimer);
    this.element.inert = false;
    const actions = this.actions(), below = top < 148, cy = below ? 12 : 136;
    this.element.style.left = `${Math.max(16, Math.min(innerWidth - 272, x - 128))}px`;
    this.element.style.top = `${Math.max(16, Math.min(innerHeight - 164, below ? bottom : top - 136))}px`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 148');
    svg.setAttribute('role', 'menu'); svg.setAttribute('aria-label', 'Together');
    // Animate vector transforms, not a CSS-scaled bitmap of the SVG (which blurs in WebKit).
    const spring = document.createElementNS(svg.namespaceURI, 'g');
    spring.setAttribute('transform', `translate(128 ${cy})`);
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    spring.innerHTML = `<g>${animate ? `<animateTransform attributeName="transform" type="scale"
      values=".18 .1;1.08 1.12;.98 .96;1 1" keyTimes="0;.46;.72;1" calcMode="spline" keySplines=".2 0 .3 1;.4 0 .6 1;.4 0 .6 1" dur=".28s" fill="freeze"/>
      <animate attributeName="opacity" values="0;1" dur=".12s" fill="freeze"/>` : ''}
      <g>${animate ? `<animateTransform attributeName="transform" type="rotate"
        values="-6;1;-.5;0" keyTimes="0;.46;.72;1" calcMode="spline" keySplines=".2 0 .3 1;.4 0 .6 1;.4 0 .6 1" dur=".28s" fill="freeze"/>` : ''}
        <g class="art" transform="translate(-128 ${-cy})"></g>
      </g></g>`;
    const art = spring.querySelector('.art');
    svg.append(spring);
    actions.forEach((a, i) => {
      const angle = j => below ? Math.PI - Math.PI * j / actions.length : Math.PI + Math.PI * j / actions.length;
      const start = angle(i), end = angle(i + 1), mid = (start + end) / 2;
      // Smooth pen wobble in the geometry itself, so the stroke never breaks into filter pixels.
      const point = (r, t) => {
        r += 1.1 * Math.sin(5 * t) + .6 * Math.sin(9 * t);
        return [128 + r * Math.cos(t), cy + r * Math.sin(t)];
      };
      const arc = (r, from, to) => {
        let path = '';
        const step = (to - from) / 8;
        for (let j = 0; j < 8; j++) {
          const t = from + j * step, u = t + step, p = point(r, t), q = point(r, u);
          const tangent = a => {
            const before = point(r, a - .001), after = point(r, a + .001);
            return after.map((v, k) => (v - before[k]) / .002);
          };
          const v = tangent(t), w = tangent(u);
          path += ` C${p.map((n, k) => n + v[k] * step / 3)} ${q.map((n, k) => n - w[k] * step / 3)} ${q}`;
        }
        return path;
      };
      const item = document.createElementNS(svg.namespaceURI, 'g');
      item.setAttribute('role', 'menuitem'); item.setAttribute('tabindex', '0'); item.setAttribute('aria-label', a.label);
      const ix = 128 + 87 * Math.cos(mid), iy = cy + 87 * Math.sin(mid);
      item.innerHTML = `<path class="segment" d="M${point(120, start)}${arc(120, start, end)}
        Q${point(82, end + .012)} ${point(45, end)}${arc(45, end, start)}
        Q${point(82, start + .012)} ${point(120, start)} Z"/>
        <g class="symbol" transform="translate(${ix - 12},${iy - 24})">${a.icon}</g>`;
      const label = document.createElementNS(svg.namespaceURI, 'text');
      label.setAttribute('x', ix); label.setAttribute('y', iy + 13);
      (a.lines || [a.label]).forEach((line, row) => {
        const span = document.createElementNS(svg.namespaceURI, 'tspan');
        span.setAttribute('x', ix); span.setAttribute('dy', row ? 14 : 0); span.textContent = line;
        label.append(span);
      });
      item.append(label);
      const select = () => { this.hide(); this.choose(a.id); };
      item.onclick = e => { if (e.detail === 0 && this.open) select(); };
      item.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } };
      art.append(item);
    });
    this.element.replaceChildren(svg);
    this.element.hidden = false;
    svg.setCurrentTime(0);
    this.element.querySelector('[role=menuitem]')?.focus({ preventScroll: true });
  }

  hide() {
    if (!this.open) return;
    this.endPress();
    this.element.inert = true;
    this.onClose();
    const svg = this.element.querySelector('svg');
    const scale = svg.querySelector('animateTransform[type="scale"]');
    if (!scale || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.element.hidden = true;
      return;
    }
    const rotate = svg.querySelector('animateTransform[type="rotate"]');
    const matrix = scale.parentNode.transform.animVal.getItem(0).matrix;
    const angle = rotate.parentNode.transform.animVal.getItem(0).angle;
    scale.setAttribute('values', `${matrix.a} ${matrix.d};1.04 1.06;.12 .04;0 0`);
    rotate.setAttribute('values', `${angle};2;-4;-6`);
    for (const animation of [scale, rotate]) {
      animation.setAttribute('keyTimes', '0;.2;.85;1');
      animation.setAttribute('keySplines', '.3 0 .6 1;.4 0 .7 1;.3 0 .7 1');
      animation.setAttribute('dur', '.18s');
      animation.beginElement();
    }
    svg.unpauseAnimations();
    this.closeTimer = setTimeout(() => { this.element.hidden = true; }, 180);
  }
}
