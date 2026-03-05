// Game Layer: DomainTickアダプター + シミュレーションフロー構築

import type { GameConfig } from '@core/config';
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
      const autoStarted = updateWaveSpawning(state, config, stage, waveRuntime, dt);
      if (autoStarted) {
        state.metrics.waveSkips.push({ waveIndex: state.waveIndex, remainingSec: 0 });
      }
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

  return flow;
}
