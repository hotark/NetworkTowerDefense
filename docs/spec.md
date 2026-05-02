# ゲーム仕様書

## 概要

ネットワーク構築型タワーディフェンス。ジェネレータがパケットを生成し、エッジ（有向リンク）経由でタワーへ供給。タワーはパケットを弾薬として消費し敵を迎撃する。全30ウェーブを防衛すれば勝利。

## エンティティ一覧

| エンティティ | ID型 | 格納先 |
|---|---|---|
| タワーノード | `NodeId` | `state.nodes` |
| エッジ | `EdgeId` | `state.edges` |
| パケット | `PacketId` | `state.packets` |
| 敵 | `EnemyId` | `state.enemies` |
| 弾（味方） | `BulletId` | `state.bullets` |
| 弾（敵） | `BulletId` | `state.enemyBullets` |
| エフェクト | なし | `state.effects[]` |

## タワー種別

| 種別 | 役割 | パケット処理 |
|---|---|---|
| generator | パケット生成 | 出力エッジへ1 charge送出 |
| sniper | 高火力・狭範囲 | 1 charge → ammo +1 |
| rapid | 速射・低火力 | 1 charge → ammo +1 |
| cannon | 広範囲・中火力 | 1 charge → ammo +1 |
| distributor | マルチキャスト | 1 charge消費 → fanout先にコピー送出 |
| repeater | charge増幅 | charge + boost → 次エッジへ転送 |

## 敵種別

| 種別 | 行動 | 特殊 |
|---|---|---|
| normal | 経路移動 → 拠点攻撃 | - |
| fast | 経路移動 → 拠点攻撃 | 高速・低HP |
| tank | 経路移動 → 拠点攻撃 | 低速・高HP、ボス有 |
| edgeAttacker | 経路移動 + エッジ射撃 | エッジを破壊可能 |
| towerAttacker | 経路移動 + タワー射撃 | タワーを破壊可能 |
| disabler | 経路移動 → 拠点攻撃 | （予約枠） |

## 状態遷移図

### ゲーム全体

```mermaid
stateDiagram-v2
    [*] --> メニュー
    メニュー --> playing : start-game
    playing --> defeat : baseHp ≤ 0
    playing --> victory : 全Wave完了 + 敵数0
    defeat --> メニュー : restart
    victory --> メニュー : restart
```

### ウェーブフェーズ (`state.wavePhase`)

```mermaid
stateDiagram-v2
    prep --> active : countdown=0 or スキップ
    active --> complete : spawnQueue空 + enemies空
    complete --> prep : nextWaveDelay消化後
```

### ノード状態 (`NodeStatus`)

```mermaid
stateDiagram-v2
    building --> active : buildTimer=0
    active --> upgrading : upgrade購入
    upgrading --> active : upgradeTimer=0 (Lv+1)
    active --> disabled : toggle / disabler攻撃
    disabled --> active : toggle / disableTimer=0
    active --> [*] : HP≤0 (接続エッジ連鎖削除)
```

### エッジ状態 (`EdgeStatus`)

```mermaid
stateDiagram-v2
    active --> upgrading : upgrade購入
    upgrading --> active : disableTimer=0 (Lv+1)
    active --> disabled : toggle
    disabled --> active : toggle
    active --> destroyed : HP≤0
```

### 弾ライフサイクル

```mermaid
stateDiagram-v2
    [*] --> 追尾移動 : 発射
    追尾移動 --> Hit : d<8 & target生存
    追尾移動 --> deadPos移動 : target死亡
    Hit --> [*] : 削除
    deadPos移動 --> [*] : 到達後削除
```

## ゲームループ（1フレームの処理順序）

```mermaid
flowchart TD
    A[1. processInput] --> B[2. updateWaveSpawning]
    B --> C[3. updateBuildTimers]
    C --> D[4. tickGenerators]
    D --> E[5. updatePackets]
    E --> F[6. tickHeldPackets]
    F --> G[7. updateTowerAttacks]
    G --> H[8. updateBaseAttack]
    H --> I[9. updateBullets + processHits]
    I --> J[10. updateEnemies]
    J --> K[11. updateEnemyBullets]
    K --> L[12. processRepairs]
    L --> M[13. checkGameEnd]
    M --> N[14. updateEffects]
```

## パケットフロー

```mermaid
sequenceDiagram
    participant G as Generator
    participant E as Edge
    participant N as Node.held[]
    participant AT as 攻撃タワー
    participant D as Distributor
    participant R as Repeater

    G->>E: emit(charge=1)
    E->>E: progress 0→1 移動
    E->>N: arrive → HeldPacket追加
    N->>N: holdTimer消化

    alt 攻撃タワー (sniper/rapid/cannon)
        N->>AT: ammo += 1
        Note over AT: charge>1 → 残りheld再追加
    else distributor
        N->>D: 1 charge消費
        D->>E: fanout先にコピー送出
        Note over D: charge>1 → 残りheld再追加
    else repeater
        N->>R: charge + boost
        R->>E: 増幅後charge送出
        Note over R: 残りあればheld再追加
    end
```

## エッジ容量制御

```mermaid
flowchart TD
    A[emitPacket] --> B{edge.status = active?}
    B -- No --> Z[null]
    B -- Yes --> C[currentCharge = Σ edge上packet.charge]
    C --> D[available = capacity - currentCharge]
    D --> E{available < 1?}
    E -- Yes --> Z
    E -- No --> F[actualCharge = min request, floor available]
    F --> G[Packet生成]
```

## 経済パラメータ

| パラメータ | 値 |
|---|---|
| 初期資源 | 600 |
| 最大レベル | 5 |
| 撤去返金率 | 50% |
| ウェーブスキップボーナス | 5$/秒 |
| 拠点回復 | 5HP / $100 |

## マップ構成

- 敵経路: 7点の折れ線（S字パス）
- ノードスロット: 33箇所（6行、固定座標）
- 拠点位置: (400, 555)
