// Addressed actions; the UI doesn't know how they're delivered. Supply a transport when pairing exists.
class BuddyClient extends EventTarget {
  constructor(id, transport = null) {
    super();
    this.id = id;
    this.transport = transport;
  }

  async send(to, action, payload = {}) {
    if ((!to && !this.transport) || !action) throw new Error('An action needs a recipient and a name.');
    const event = { id: crypto.randomUUID(), from: this.id, to, action, payload };
    // No configured backend: keep the browser and Debug previews local.
    if (!this.transport) return { status: 'preview', event };
    const result = await this.transport.send(event);
    return { status: result?.status || 'sent', event };
  }

  receive(event) {
    if (!event || event.to !== this.id || typeof event.id !== 'string' || typeof event.from !== 'string'
        || typeof event.action !== 'string' || !event.payload || typeof event.payload !== 'object') return false;
    this.dispatchEvent(new CustomEvent('action', { detail: event }));
    return true;
  }
}
