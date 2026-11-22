// One actor per remote installation, shared by persistent scenes and temporary deliveries.
class Actors {
  constructor() { this.byId = new Map(); }
  acquire(id, character, owner) {
    let actor = this.byId.get(id);
    if (!actor) {
      actor = { id, character: character.create?.() || character, x: null, y: null, visible: false, ready: false, owners: new Set() };
      this.byId.set(id, actor);
    }
    actor.owners.add(owner);
    return actor;
  }
  release(actor, owner) {
    actor.owners.delete(owner);
    if (!actor.owners.size) this.byId.delete(actor.id);
  }
}
