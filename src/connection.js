// Durable local queues plus WebSocket wake-ups and HTTP delivery. Registration is automatic; nobody enters a code.
class CloudConnection {
  constructor(url, { storage = localStorage, fetch = globalThis.fetch.bind(globalThis), character, appearance = () => ({character:character(), accessories:{}}), isActive, canPlay = () => true, onGesture, onState, WebSocket = globalThis.WebSocket }) {
    this.WebSocket = WebSocket; this.stopped = true; this.needsSync = true; this.retryAt = 0; this.delay = 1000;
    this.url = url.replace(/\/$/, ''); this.storage = storage; this.fetch = fetch;
    this.character = character; this.appearance = appearance; this.isActive = isActive; this.canPlay = canPlay; this.onGesture = onGesture; this.onState = onState;
    this.key = `nematode-cloud:${this.url}`;
    const saved = storage.getItem(this.key);
    if (saved) {
      this.state = JSON.parse(saved); // never silently replace an unreadable identity with a new user
      if (!this.state.id || !this.state.secret || !Array.isArray(this.state.outbox) || !Array.isArray(this.state.inbox)
          || !Array.isArray(this.state.receipts)) throw new Error('Saved connection could not be read');
    } else {
      const secret = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
      this.save({ id: crypto.randomUUID(), secret, outbox: [], inbox: [], receipts: [], together: null });
    }
    this.peer = null; this.playing = null; this.running = false; this.profile = null; this.applied = null;
  }

  save(state) {
    this.storage.setItem(this.key, JSON.stringify(state));
    this.state = state;
  }

  async request(path, data) {
    const response = await this.fetch(this.url + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.state.id}:${this.state.secret}` },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Connection request failed (${response.status})`);
    return response.json();
  }

  async send(event) {
    if (event.from !== this.state.id) throw new Error('Wrong sender');
    this.save({ ...this.state, outbox: [...this.state.outbox, event] });
    void this.cycle().catch(() => {}); // the queue is already saved; the connection loop retries failures
    return { status: 'queued' };
  }

  applyState(active) {
    const state = this.state.together;
    if (!active || !this.canPlay() || !state || this.state.outbox.some(e => e.action === 'together' || e.action === 'separate')) return;
    const signature = JSON.stringify(state);
    if (signature !== this.applied && this.onState(state) !== false) this.applied = signature;
  }

  async playNext() {
    if (this.playing || !this.canPlay() || !this.state.inbox.length || !await this.isActive()) return;
    const event = this.state.inbox[0];
    this.playing = event.id;
    if (this.onGesture(event, () => this.complete(event.id).catch(() => { this.playing = null; })) === false) this.playing = null;
  }

  async complete(id) {
    // If the user left while the animation was running, keep the gesture for their return.
    if (await this.isActive()) this.save({ ...this.state, inbox: this.state.inbox.filter(e => e.id !== id),
      receipts: [...new Set([...this.state.receipts, id])] });
    this.playing = null;
    this.needsSync = true;
  }

  async cycle() {
    if (this.running) { this.needsSync = true; return; }
    this.running = true; this.needsSync = false;
    try {
      const active = await this.isActive();
      this.applyState(active);
      await this.playNext(); // downloaded gestures also work while the network is down
      const appearance = this.appearance(), profile = JSON.stringify(appearance);
      if (this.profile !== profile) {
        await this.request('/register', { character: appearance.character, appearance }); this.profile = profile;
      }
      if (!this.stopped && !this.socket) this.connect();
      // Keep action ordering, including Together then Separate; retries use the same event ID.
      for (const event of [...this.state.outbox]) {
        await this.request('/actions', event);
        this.save({ ...this.state, outbox: this.state.outbox.filter(e => e.id !== event.id) });
      }
      const receipts = this.state.receipts.slice(0, 50);
      if (receipts.length) {
        await this.request('/ack', { ids: receipts });
        this.save({ ...this.state, receipts: this.state.receipts.filter(id => !receipts.includes(id)) });
      }
      const sync = await this.request('/sync');
      this.peer = sync.peer;
      const known = new Set([...this.state.inbox.map(e => e.id), ...this.state.receipts]);
      const events = sync.events.filter(e => e.to === this.state.id && !known.has(e.id));
      this.save({ ...this.state, inbox: [...this.state.inbox, ...events], together: sync.together });
      this.applyState(active);
      await this.playNext();
      if (this.stopped || this.socket?.readyState === 1) { this.retryAt = 0; this.delay = 1000; }
    } catch (e) {
      this.needsSync = true;
      this.retryAt = Date.now() + this.delay;
      this.delay = Math.min(30000, this.delay * 2);
      throw e;
    } finally { this.running = false; }
  }

  connect() {
    // Subprotocol headers carry the credential, never a URL query string or a logged message.
    const socket = new this.WebSocket(this.url.replace(/^http/, 'ws') + '/live',
      ['nematode', `device.${this.state.id}.${this.state.secret}`]);
    this.socket = socket; this.connectedAt = Date.now(); this.lastPing = 0;
    const disconnected = () => {
      if (this.socket !== socket) return;
      this.socket = null; this.needsSync = true;
      this.retryAt = Date.now() + this.delay;
      this.delay = Math.min(30000, this.delay * 2);
    };
    socket.onopen = () => { if (this.socket === socket) this.lastPong = this.lastPing = Date.now(); };
    socket.onmessage = ({ data }) => {
      if (this.socket !== socket) return;
      if (data === 'pong') this.lastPong = Date.now();
      if (data === 'sync') {
        this.needsSync = true;
        void this.cycle().catch(() => {});
      }
    };
    socket.onclose = disconnected;
    socket.onerror = () => { disconnected(); socket.close(); };
  }

  async tick() {
    const now = Date.now(), socket = this.socket;
    if (socket && ((socket.readyState === 0 && now - this.connectedAt > 10000)
        || (socket.readyState === 1 && (now - this.lastPong > 60000
          || (this.lastPing > this.lastPong && now - this.lastPing > 10000))))) {
      this.socket = null; socket.close(); this.needsSync = true; this.retryAt = 0;
    } else if (socket?.readyState === 1 && now - this.lastPing >= 30000) {
      this.lastPing = now; socket.send('ping'); // Cloudflare answers without waking the hibernating object
    }
    // Local activity checks never make network requests. Saved gestures can play offline.
    this.applyState(await this.isActive());
    await this.playNext();
    if (!this.running && now >= this.retryAt && (this.needsSync || !this.socket
        || this.profile !== JSON.stringify(this.appearance()) || this.state.outbox.length || this.state.receipts.length)) await this.cycle();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = async () => {
      try { await this.tick(); } catch (e) { console.warn(e.message); }
      if (!this.stopped) this.timer = setTimeout(loop, 1000);
    };
    void loop();
  }

  stop() {
    this.stopped = true; clearTimeout(this.timer);
    const socket = this.socket; this.socket = null; socket?.close();
  }
}
