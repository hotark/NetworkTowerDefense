// Game Layer: DomainTickアダプター + シミュレーションフロー構築

import type { GameConfig } from '@core/config';
import { getTowerLevelStats, getEdgeLevelStats } from '@core/config';
import type { Effect, EnemyId, BulletId, Bullet, Enemy, StageData } from '@core/types';
import type { BulletHit } from '@core/combat/logic';
import { addImpactEffect, addExplosionParticles } from '@core/combat/effects';
import { applyBulletHits, updateTowerAttacks, updateBaseAttack, updateBullets, updateEnemyBullets } from '@core/combat/tick';
import { tickGenerators, updatePackets, tickHeldPackets } from '@core/network/tick';
import { updateWaveSpawning, updateEnemies } from '@core/wave/tick';
import type { WaveRuntime } from '@core/wave/logic';
import { updateBuildTimers } from '@core/economy/tick';
import { updateEffects, updateEffectPositions } from '@core/effects/manager';
import { updateMetricsElapsed } from './scoring';
import { GameFlow } from './game-flow';
import { outgoingEdges } from '@core/state';
import { getNodeRollingMetrics, getEdgeRollingMetrics } from '@core/metrics';
import { chargeOnEdge } from '@core/network/logic';
import { findClosestEnemy } from '@core/combat/spatial';

// ── processHits: GameApp.processHitsからの抽出 ──

interface ProcessHitsView {
  readonly effects: Effect[];
  readonly enemies: Map<EnemyId, Enemy>;
  readonly bullets: Map<BulletId, Bullet>;
  resources: number;
}

export function processHits(
  view: ProcessHitsView, config: GameConfig, hits: BulletHit[],
): void {
  for (const hit of hits) {
    if (hit.towerType === 'cannon') {
      addImpactEffect(view.effects, hit.x, hit.y, 'cannon', hit.level);
      addExplosionParticles(view.effects, hit.x, hit.y, '#cc44ff', 6);
    } else if (hit.towerType === 'sniper') {
      addImpactEffect(view.effects, hit.x, hit.y, 'sniper', hit.level);
    } else if (hit.towerType === 'rapid') {
      addImpactEffect(view.effects, hit.x, hit.y, 'rapid', hit.level);
    } else {
      addImpactEffect(view.effects, hit.x, hit.y, 'cannon', 1);
    }
  }
  // applyBulletHits expects CombatView but only uses enemies + resources
  applyBulletHits(view as any, hits);

  for (const hit of hits) {
    const enemy = view.enemies.get(hit.targetId);
    if (enemy && enemy.hp <= 0) {
      const typeDef = config.enemyTypes[enemy.type];
      addExplosionParticles(view.effects, enemy.x, enemy.y, typeDef?.stroke ?? '#ff4466', 8);
      for (const b of view.bullets.values()) {
        if (b.targetId === hit.targetId && !b.deadPos) {
          b.deadPos = { x: enemy.x, y: enemy.y };
        }
      }
      view.enemies.delete(hit.targetId);
    }
  }
}

// ── シミュレーションフロー構築 ──

export function createSimulationFlow(stage: StageData, waveRuntime: WaveRuntime): GameFlow {
  const flow = new GameFlow();

  // 1. ウェーブスポーン
  flow.addTick({
    tick(state, config, dt) {
      updateWaveSpawning(state, config, stage, waveRuntime, dt);
    },
  });

  // 2. 建設・アップグレードタイマー
  flow.addTick({
    tick(state, config, dt) {
      updateBuildTimers(state, config, dt);
    },
  });

  // 3. パケットシステム
  flow.addTick({
    tick(state, config, dt) {
      tickGenerators(state, config, dt);
      updatePackets(state, config, dt);
      tickHeldPackets(state, config, dt);
    },
  });

  // 4. 戦闘（タワー攻撃 + 弾移動 + ヒット処理）
  flow.addTick({
    tick(state, config, dt) {
      updateTowerAttacks(state, config, dt);
      updateBaseAttack(state, config, dt);
      const hits = updateBullets(state, dt);
      processHits(state, config, hits);
    },
  });

  // 5. 敵移動 + 敵弾
  flow.addTick({
    tick(state, config, dt) {
      updateEnemies(state, config, stage, dt);
      updateEnemyBullets(state, config, dt);
    },
  });

  // 6. エフェクト更新
  flow.addTick({
    tick(state, _config, dt) {
      updateEffects(state.effects, dt);
      updateEffectPositions(state.effects, dt);
    },
  });

  // 7. simTime + メトリクス経過時間
  flow.addTick({
    tick(state, _config, dt) {
      state.simTime += dt;
      updateMetricsElapsed(state, dt);
    },
  });

  // 8. ローリングメトリクス収集（差分ベース + アイドル判定）
  const prevCumulative = {
    attackTower: new Map<string, { received: number; consumed: number }>(),
    edge: new Map<string, { sent: number; arrived: number }>(),
    queueNode: new Map<string, { received: number; forwarded: number }>(),
    generator: new Map<string, { generated: number }>(),
  };

  flow.addTick({
    tick(state, config, dt) {
      const simTime = state.simTime;
      const rm = state.rollingMetrics;

      // --- 供給/消費イベントを差分で記録 ---

      // Attack Towers
      for (const [id, m] of state.metrics.attackTower) {
        const prev = prevCumulative.attackTower.get(id) ?? { received: 0, consumed: 0 };
        const nrm = getNodeRollingMetrics(rm, id);
        const dReceived = m.receivedAmmo - prev.received;
        const dConsumed = m.consumedAmmo - prev.consumed;
        if (dReceived > 0) nrm.supply.recordEvent(simTime, dReceived);
        if (dConsumed > 0) nrm.consumption.recordEvent(simTime, dConsumed);
        prevCumulative.attackTower.set(id, { received: m.receivedAmmo, consumed: m.consumedAmmo });
      }

      // Edges
      for (const [id, m] of state.metrics.edge) {
        const prev = prevCumulative.edge.get(id) ?? { sent: 0, arrived: 0 };
        const erm = getEdgeRollingMetrics(rm, id);
        const dSent = m.sent - prev.sent;
        if (dSent > 0) erm.supply.recordEvent(simTime, dSent);
        const dArrived = m.arrived - prev.arrived;
        if (dArrived > 0) erm.consumption.recordEvent(simTime, dArrived);
        prevCumulative.edge.set(id, { sent: m.sent, arrived: m.arrived });
      }

      // Queue nodes (Distributor/Repeater)
      for (const [id, m] of state.metrics.queueNode) {
        const prev = prevCumulative.queueNode.get(id) ?? { received: 0, forwarded: 0 };
        const nrm = getNodeRollingMetrics(rm, id);
        const dReceived = m.received - prev.received;
        const dForwarded = m.forwarded - prev.forwarded;
        if (dReceived > 0) nrm.supply.recordEvent(simTime, dReceived);
        if (dForwarded > 0) nrm.consumption.recordEvent(simTime, dForwarded);
        prevCumulative.queueNode.set(id, { received: m.received, forwarded: m.forwarded });
      }

      // Generators
      for (const [id, m] of state.metrics.generator) {
        const prev = prevCumulative.generator.get(id) ?? { generated: 0 };
        const nrm = getNodeRollingMetrics(rm, id);
        const dGenerated = m.generated - prev.generated;
        if (dGenerated > 0) nrm.consumption.recordEvent(simTime, dGenerated);
        // Generator supply = generation attempt timing (record each frame when active)
        prevCumulative.generator.set(id, { generated: m.generated });
      }

      // --- アイドル時間記録 ---
      for (const node of state.nodes.values()) {
        if (node.status === 'building' || node.status === 'upgrading') continue;
        if (node.status === 'disabled' && node.disableTimer <= 0) continue; // 手動停止
        const nrm = getNodeRollingMetrics(rm, node.id);

        if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
          if (node.status !== 'active') continue;
          const stats = getTowerLevelStats(config, node.type, node.level);
          const ammoNeeded = stats.ammoPerShot ?? 1;
          const hasEnemy = findClosestEnemy(state, node.x, node.y, stats.range ?? 0) !== null;
          if (hasEnemy && node.ammo < ammoNeeded) {
            nrm.idle.recordIdle(simTime, dt);
          }
        } else if (node.type === 'generator') {
          if (node.status !== 'active') continue;
          const edges = outgoingEdges(state, node.id);
          const allFull = edges.length > 0 && edges.every(e => {
            const lvl = getEdgeLevelStats(config, e.level);
            return chargeOnEdge(state, e.id) >= lvl.capacity;
          });
          if (allFull || edges.length === 0) {
            nrm.idle.recordIdle(simTime, dt);
          }
        } else if (node.type === 'distributor' || node.type === 'repeater') {
          if (node.status !== 'active') continue;
          // holdTime完了後に全出力エッジ満杯 → idle
          if (node.held.length > 0 && node.held[0].timer <= 0) {
            const edges = outgoingEdges(state, node.id);
            const allFull = edges.length > 0 && edges.every(e => {
              const lvl = getEdgeLevelStats(config, e.level);
              return chargeOnEdge(state, e.id) >= lvl.capacity;
            });
            if (allFull || edges.length === 0) {
              nrm.idle.recordIdle(simTime, dt);
            }
          }
        }
      }

      // Edge idle: disabled or full capacity
      for (const edge of state.edges.values()) {
        if (edge.status === 'destroyed') continue;
        const erm = getEdgeRollingMetrics(rm, edge.id);
        if (edge.status === 'disabled') {
          if (edge.disableTimer > 0) {
            // ダメージ停止中: idle
            erm.idle.recordIdle(simTime, dt);
          }
          // 手動停止: idle に含めない
        } else if (edge.status === 'active') {
          const lvl = getEdgeLevelStats(config, edge.level);
          if (chargeOnEdge(state, edge.id) >= lvl.capacity) {
            erm.idle.recordIdle(simTime, dt);
          }
        }
      }

      // --- prune ---
      for (const m of rm.node.values()) {
        m.supply.prune(simTime);
        m.consumption.prune(simTime);
        m.idle.prune(simTime);
      }
      for (const m of rm.edge.values()) {
        m.supply.prune(simTime);
        m.consumption.prune(simTime);
        m.idle.prune(simTime);
      }
    },
  });

  return flow;
}
