# Core層 (`src/core/`)

純粋データ層。DOM/Canvas非依存。型定義・状態管理・設定値・カメラ・入力を提供。

## ファイル構成

| ファイル | 責務 |
|---|---|
| `types.ts` | ブランド型ID、エンティティinterface、敵定義型 |
| `config.ts` | `GameConfig` interface + `GAME_CONFIG` 定数 + ヘルパー関数 |
| `state.ts` | `GameState` interface + ファクトリ + ID生成 + エッジ検索 |
| `camera.ts` | `Camera` クラス (zoom/pan/transform) |
| `input.ts` | `InputManager` クラス (Pointer Events → アクションキュー) |

## 型システム

### ブランド型ID

全IDは単一の`idCounter`から採番。`resetIdCounter()`でゲーム開始時にリセット。

```mermaid
classDiagram
    class NodeId {
        string & __brand: NodeId
        例: "n_1", "n_2"
    }
    class EdgeId {
        string & __brand: EdgeId
        例: "e_3"
    }
    class PacketId {
        string & __brand: PacketId
        例: "p_4"
    }
    class EnemyId {
        string & __brand: EnemyId
        例: "en_5"
    }
    class BulletId {
        string & __brand: BulletId
        例: "b_6"
    }
```

### 状態型

| 型 | 値 |
|---|---|
| `NodeStatus` | `building`, `active`, `upgrading`, `disabled` |
| `EdgeStatus` | `active`, `upgrading`, `disabled`, `destroyed` |
| `NodeType` | `generator`, `sniper`, `rapid`, `cannon`, `distributor`, `repeater` |
| `EnemyType` | `normal`, `fast`, `tank`, `edgeAttacker`, `towerAttacker`, `disabler` |

## GameState

```mermaid
classDiagram
    class GameState {
        +Map~NodeId, TowerNode~ nodes
        +Map~EdgeId, Edge~ edges
        +Map~PacketId, Packet~ packets
        +Map~EnemyId, Enemy~ enemies
        +Map~BulletId, Bullet~ bullets
        +Map~BulletId, EnemyBullet~ enemyBullets
        +Effect[] effects
        +number resources
        +number baseHp
        +number maxBaseHp
        +number waveIndex
        +WavePhase wavePhase
        +number simTime
        +number simSpeed
        +GameResult gameResult
    }
    class TowerNode {
        +NodeId id
        +NodeType type
        +number x, y
        +number level
        +number hp, maxHp
        +NodeStatus status
        +number ammo
        +number cooldown
        +number buildTimer
        +number upgradeTimer
        +HeldPacket[] held
        +number? facingAngle
    }
    class Edge {
        +EdgeId id
        +NodeId from, to
        +number level
        +number hp, maxHp
        +EdgeStatus status
        +number disableTimer
    }
    class Packet {
        +PacketId id
        +EdgeId edgeId
        +number progress
        +number charge
        +number speed
    }
    GameState --> TowerNode
    GameState --> Edge
    GameState --> Packet
```

### エッジ検索ヘルパー

| 関数 | 説明 |
|---|---|
| `outgoingEdges(state, nodeId)` | `from === nodeId && active` |
| `incomingEdges(state, nodeId)` | `to === nodeId && active` |
| `edgesBetween(state, a, b)` | 双方向で接続されたエッジ |
| `connectedEdges(state, nodeId)` | `from` or `to` が一致する全エッジ |

## GameConfig

```mermaid
classDiagram
    class GameConfig {
        +number PACKET_SPEED
        +number BULLET_SPEED
        +number BASE_HP
        +number INITIAL_RESOURCES
        +number MAX_LEVEL
        +Record towerLevels
        +EdgeLevelStats[] edgeLevels
        +Record towerCosts
        +Record upgradeCosts
        +Record buildDuration
        +number[] upgradeDuration
        +Record enemyTypes
        +WaveDef[] waveDefs
        +Vec2[] enemyPath
        +Vec2 basePos
        +Vec2[] nodeSlots
    }
    class TowerLevelStats {
        +number hp
        +number holdTime
        +number? cooldown
        +number? damage
        +number? range
        +number? ammoPerShot
    }
    class EdgeLevelStats {
        +number capacity
        +number speedMultiplier
        +number hp
    }
    GameConfig --> TowerLevelStats : towerLevels[type][lv]
    GameConfig --> EdgeLevelStats : edgeLevels[lv]
```

### ヘルパー関数

| 関数 | 入力 → 出力 |
|---|---|
| `getTowerLevelStats(config, type, level)` | → `TowerLevelStats` |
| `getEdgeLevelStats(config, level)` | → `EdgeLevelStats` |
| `getTowerCost(config, type)` | → `number` |
| `getUpgradeCost(config, type, level)` | → `number` |
| `getUpgradeDuration(config, level)` | → `number` |

## Camera

```mermaid
classDiagram
    class Camera {
        +CameraState state
        +screenToWorld(sx, sy) Vec2
        +worldToScreen(wx, wy) Vec2
        +applyTransform(ctx) void
        +resetTransform(ctx) void
        +zoomAt(screenX, screenY, delta) void
        +pan(dx, dy) void
        +resize(w, h) void
    }
    class CameraState {
        +number x, y
        +number zoom
        +number minZoom = 0.25
        +number maxZoom = 4
        +number viewportWidth
        +number viewportHeight
    }
    Camera --> CameraState
```

## InputManager

### アクション型

| type | パラメータ |
|---|---|
| `tap` | `worldX, worldY` |
| `drag-start` | `worldX, worldY` |
| `drag-end` | `worldX, worldY` |
| `zoom` | `centerX, centerY, delta` |
| `pan` | `dx, dy` |

### 入力 → アクション変換フロー

```mermaid
flowchart TD
    PD[PointerDown] --> PD_R{button=2?}
    PD_R -- Yes --> RD[右ドラッグ開始]
    PD_R -- No --> PD_C{指の数}
    PD_C -- 1本 --> DT[ドラッグ追跡開始]
    PD_C -- 2本 --> PI[ピンチ初期化]

    PM[PointerMove] --> PM_R{右ドラッグ中?}
    PM_R -- Yes --> PAN1[pan アクション発行]
    PM_R -- No --> PM_C{指の数}
    PM_C -- 1本 --> PM_T{閾値超え?}
    PM_T -- Yes --> DS[drag-start 発行]
    PM_C -- 2本 --> ZP[zoom + pan 発行]

    PU[PointerUp] --> PU_R{右ドラッグ終了?}
    PU_R -- Yes --> RC[isRightDrag=false]
    PU_R -- No --> PU_D{ドラッグ中?}
    PU_D -- Yes --> DE[drag-end 発行]
    PU_D -- No --> PU_T{短時間+移動少?}
    PU_T -- Yes --> TAP[tap 発行]

    WH[Wheel] --> ZOOM[zoom 発行]
```

### 座標変換チェーン

```mermaid
flowchart LR
    A[clientX/Y] -->|toLocal canvas rect補正| B[screenX/Y]
    B -->|camera.screenToWorld| C[worldX/Y]
```
