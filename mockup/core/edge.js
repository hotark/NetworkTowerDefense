// edge.js — Edge エンティティ

import { EDGE_DEF } from './config.js';

let _nextId = 1;

export class Edge {
  constructor(fromTowerId, toTowerId) {
    this.id = _nextId++;
    this.fromTowerId = fromTowerId;
    this.toTowerId = toTowerId;
    this.level = 1;
    const baseHp = Array.isArray(EDGE_DEF.hp) ? EDGE_DEF.hp[0] : EDGE_DEF.hp;
    this.hp = baseHp;
    this.maxHp = baseHp;
    this.enabled = true;
    this.destroyed = false;
    this.repairing = false;

    // 建設/アップグレード状態
    this.status = 'building'; // 'building' | 'upgrading' | 'active'
    this.buildTimer = 1.0; // ref: edge buildDuration=1s
  }

  get levelDef() { return EDGE_DEF.levels[this.level - 1]; }

  /** Total charge currently on this edge (from packets in transit) */
  chargeOnEdge(packets) {
    let sum = 0;
    for (const p of packets) {
      if (p.edgeId === this.id) sum += p.charge;
    }
    return sum;
  }

  /** Can accept more charge? */
  canAccept(packets, charge) {
    return this.chargeOnEdge(packets) + charge <= this.levelDef.bandwidth;
  }
}
