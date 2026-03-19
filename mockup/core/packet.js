// packet.js — Packet (エッジ上の移動物)

let _nextId = 1;

export class Packet {
  constructor(edgeId, charge) {
    this.id = _nextId++;
    this.edgeId = edgeId;
    this.charge = charge;
    this.progress = 0; // 0..1
  }
}
