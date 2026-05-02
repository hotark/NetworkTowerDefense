# Game層 (`src/game/`)

ゲームロジック層。Core層の型・状態を操作する純粋関数群。DOM/Canvas描画APIは`renderer.ts`のみ使用。

## ファイル構成

| ファイル | 責務 |
|---|---|
| `network.ts` | パケット生成・移動・保持キュー処理 |
| `combat.ts` | タワー攻撃・弾移動・命中判定・敵弾処理 |
| `wave.ts` | ウェーブ管理・敵スポーン・敵移動・敵攻撃 |
| `economy.ts` | 資源管理・購入・撤去返金・建設タイマー |
| `renderer.ts` | Canvas 2D描画・ヒットテスト・エフェクト |
| `scoring.ts` | スコア計算（予約） |

## network.ts — パケットネットワーク

### パケットライフサイクル

```mermaid
sequenceDiagram
    participant Gen as Generator
    participant Edge as Edge
    participant Node as 受信Node
    participant Hold as held[]キュー

    Gen->>Gen: cooldown消化
    Gen->>Edge: emitPacket(charge=1)
    Edge->>Edge: progress += (speed/len)*dt
    Edge->>Node: progress≥1 → HeldPacket追加
    Node->>Hold: holdTimer = holdTime
    Hold->>Hold: timer -= dt
    Hold-->>Node: timer≤0 → processHeldPacket()
```

### ノードタイプ別パケット処理

```mermaid
flowchart TD
    HP[processHeldPacket] --> T{node.type}

    T -->|sniper/rapid/cannon| ATK[ammo += 1]
    ATK --> ATK_C{charge > 1?}
    ATK_C -- Yes --> ATK_R[残りをheld再追加]

    T -->|repeater| REP[outCharge = charge + boost]
    REP --> REP_E[出力エッジへ部分送信]
    REP_E --> REP_C{残りあり?}
    REP_C -- Yes --> REP_R[残りをheld再追加]

    T -->|distributor| DIST[fanout先にコピー1ずつ]
    DIST --> DIST_C{charge > 1?}
    DIST_C -- Yes --> DIST_R[残りをheld再追加]

    T -->|default| DEF[1 charge転送]
    DEF --> DEF_C{charge > 1?}
    DEF_C -- Yes --> DEF_R[残りをheld再追加]
```

### 容量制御

```mermaid
flowchart TD
    A[emitPacket] --> B{edge.status = active?}
    B -- No --> Z[null 送出不可]
    B -- Yes --> C["currentCharge = Σ(edge上packet.charge)"]
    C --> D[available = capacity - currentCharge]
    D --> E{available < 1?}
    E -- Yes --> Z
    E -- No --> F["actualCharge = min(request, floor(available))"]
    F --> G[Packet生成]
```

## combat.ts — 戦闘システム

### タワー攻撃フロー

```mermaid
flowchart TD
    A[updateTowerAttacks] --> B[for each 攻撃タワー]
    B --> C[closest = findClosestEnemy range内]
    C --> D{closest存在?}
    D -- Yes --> E[facingAngle → lerpAngle旋回]
    D -- No --> B
    E --> F{cooldown > 0?}
    F -- Yes --> G[cooldown -= dt, skip]
    F -- No --> H{ammo >= ammoPerShot?}
    H -- No --> B
    H -- Yes --> I[ammo -= ammoPerShot]
    I --> J[cooldown = stats.cooldown]
    J --> K[Bullet生成 → state.bullets]
```

### 弾移動・命中

```mermaid
stateDiagram-v2
    [*] --> 追尾移動 : Bullet生成
    追尾移動 --> Hit : d < 8 & target生存
    追尾移動 --> deadPos設定 : target死亡
    deadPos設定 --> deadPos移動
    deadPos移動 --> 消滅 : d < 8
    Hit --> ダメージ適用 : enemy.hp -= damage
    ダメージ適用 --> 報酬 : hp ≤ 0 → resources += reward
    Hit --> 消滅
    消滅 --> [*]
```

### 敵弾命中

```mermaid
flowchart TD
    A[updateEnemyBullets] --> B[直進移動]
    B --> C{d < 8?}
    C -- No --> B
    C -- Yes --> D{targetKind}
    D -->|edge| E[edge.hp -= damage]
    E --> F{hp ≤ 0?}
    F -- Yes --> G[edge.status = destroyed]
    D -->|node| H[node.hp -= damage]
    H --> I{hp ≤ 0?}
    I -- Yes --> J[node削除 + 接続エッジ連鎖削除]
```

## wave.ts — ウェーブ管理

### ウェーブ進行シーケンス

```mermaid
sequenceDiagram
    participant P as prep
    participant S as startWave
    participant Q as spawnQueue
    participant E as enemies

    P->>P: waveCountdown -= dt
    alt countdown=0 or スキップ
        P->>S: startWave()
        S->>S: waveIndex++
        S->>Q: waveDef → queue (ノーマルシャッフル + ボス末尾)
        S->>S: nextWaveDelay = 5s
    end

    loop spawnQueue消化
        Q->>Q: spawnTimer -= dt (0.8s間隔)
        Q->>E: createEnemy() → state.enemies
    end

    Note over E: queue空 + enemies空 → complete
```

### 敵移動アクティビティ

```mermaid
flowchart TD
    A[updateEnemies] --> B[for each enemy]
    B --> C{HP ≤ 0?}
    C -- Yes --> D[除去]
    C -- No --> E{atBase?}
    E -- Yes --> F[attackTimer消化 → baseHp -= 1]
    E -- No --> G{behavior}
    G -->|edgeAttack| H[attackTimer消化 → createEnemyShot edge]
    G -->|towerAttack| I[attackTimer消化 → createEnemyShot node]
    G -->|path| J[経路移動]
    H --> J
    I --> J
    J --> K[angle = lerpAngle → ウェイポイントへ移動]
    K --> L{最終点到達?}
    L -- Yes --> M[atBase = true, baseHp -= 1]
    L -- No --> B
```

## economy.ts — 経済システム

### 購入アクション

| アクション | コスト源 | 状態変更 |
|---|---|---|
| `place-tower` | `towerCosts[type]` | Node生成 (status=building) |
| `upgrade-tower` | `upgradeCosts[type][lv-1]` | status=upgrading, upgradeTimer設定 |
| `upgrade-edge` | `edgeUpgradeCosts[lv-1]` | status=upgrading, disableTimer設定 |
| `create-edge` | `edgeCost (10)` | Edge生成 (status=active) |

### 建設タイマー処理

```mermaid
stateDiagram-v2
    state ノード {
        building --> active : buildTimer=0
        upgrading2: upgrading
        upgrading2 --> active2: upgradeTimer=0
        active2: active (Lv+1, HP比率維持)
        disabled --> active3: disableTimer=0
        active3: active
    }
    state エッジ {
        disabled_e: disabled
        disabled_e --> active_e : disableTimer=0
        active_e: active
        upgrading_e: upgrading
        upgrading_e --> active_e2 : disableTimer=0
        active_e2: active (Lv+1, HP比率維持)
    }
```

## renderer.ts — 描画システム

### 描画順序（Z-order）

```mermaid
flowchart TD
    A[camera.applyTransform] --> B[1. 背景グリッド]
    B --> C[2. エッジ active/upgrading/disabled]
    C --> D[3. ドラッグプレビュー]
    D --> E[4. パケット]
    E --> F[5. ノード SVGスプライト+facingAngle回転]
    F --> F2[6. 拠点 SVGスプライト 回転なし]
    F2 --> G[7. 空きスロット]
    G --> H[8. 敵 SVGスプライト]
    H --> I[9. 味方弾 タワータイプ別]
    I --> J[10. 敵弾]
    J --> K[11. HPバー 敵・ノード]
    K --> L[12. エフェクト]
    L --> M[camera.resetTransform]
```

### ヒットテスト

| 関数 | 判定 |
|---|---|
| `hitTestNode(state, config, wx, wy)` | ノード中心との距離 < NODE_RADIUS |
| `hitTestEmptySlot(state, config, wx, wy)` | スロット座標との距離 < NODE_RADIUS, 未使用 |
| `hitTestEdge(state, wx, wy)` | エッジ線分への最近接点距離 < 15px |
