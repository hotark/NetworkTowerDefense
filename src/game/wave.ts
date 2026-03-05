// Game Layer: ウェーブシステム — Core層からの再エクスポート

export { createWaveRuntime, checkGameEnd } from '@core/wave/logic';
export type { WaveRuntime } from '@core/wave/logic';
export { startWave, updateWaveSpawning, updateEnemies } from '@core/wave/tick';
