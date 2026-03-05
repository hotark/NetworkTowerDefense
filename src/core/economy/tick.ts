// Core Layer: 経済システム — Tickオーケストレーション

import type { EconomyView } from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerHp, getEdgeLevelStats } from '@core/config';

/** 建設・アップグレードタイマー */
export function updateBuildTimers(view: EconomyView, config: GameConfig, dt: number): void {
  // ノード
  for (const node of view.nodes.values()) {
    if (node.status === 'building') {
      node.buildTimer -= dt;
      if (node.buildTimer <= 0) {
        node.buildTimer = 0;
        node.status = 'active';
      }
    }
    if (node.status === 'upgrading') {
      node.upgradeTimer -= dt;
      if (node.upgradeTimer <= 0) {
        node.upgradeTimer = 0;
        const oldMaxHp = node.maxHp;
        node.level++;
        const newMaxHp = getTowerHp(config, node.type, node.level);
        node.maxHp = newMaxHp;
        node.hp = Math.round(node.hp * (newMaxHp / oldMaxHp));
        node.status = 'active';
      }
    }
    if (node.status === 'disabled' && node.disableTimer > 0) {
      node.disableTimer -= dt;
      if (node.disableTimer <= 0) {
        node.disableTimer = 0;
        node.status = 'active';
      }
    }
  }

  // エッジ
  for (const edge of view.edges.values()) {
    if (edge.status === 'disabled' && edge.disableTimer > 0) {
      edge.disableTimer -= dt;
      if (edge.disableTimer <= 0) {
        edge.disableTimer = 0;
        edge.status = 'active';
      }
    }
    if (edge.status === 'upgrading') {
      edge.disableTimer -= dt;
      if (edge.disableTimer <= 0) {
        edge.disableTimer = 0;
        const oldMaxHp = edge.maxHp;
        edge.level++;
        const newStats = getEdgeLevelStats(config, edge.level);
        edge.maxHp = newStats.hp;
        edge.hp = Math.round(edge.hp * (newStats.hp / oldMaxHp));
        edge.status = 'active';
      }
    }
  }
}
