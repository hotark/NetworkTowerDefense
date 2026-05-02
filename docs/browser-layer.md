# Browser層 (`src/browser/`)

DOM操作・イベントバインディング層。Game層の関数を呼び出してUIと接続する。

## ファイル構成

| ファイル | 責務 |
|---|---|
| `game-app.ts` | `GameApp` クラス — ゲームループ統括（Presenter） |
| `hud.ts` | Preact Signals による HUD バインディング |

## アーキテクチャ

```mermaid
flowchart TB
    subgraph Browser["Browser層"]
        GA[GameApp Presenter]
        HUD[HUD Preact Signals]
        HTML[index.html DOM/CSS]
        GA --> HUD
        GA --> HTML
    end

    subgraph Game["Game層"]
        NET[network.ts]
        CMB[combat.ts]
        WAV[wave.ts]
        ECO[economy.ts]
        REN[renderer.ts]
    end

    subgraph Core["Core層"]
        TYP[types.ts]
        CFG[config.ts]
        STA[state.ts]
        CAM[camera.ts]
        INP[input.ts]
    end

    GA -->|呼出| Game
    Game -->|import| Core
    GA -->|import| Core
```

## GameApp ライフサイクル

```mermaid
sequenceDiagram
    participant C as Constructor
    participant S as start()
    participant L as loop()
    participant M as Menu

    C->>C: Camera, InputManager 初期化
    C->>C: resize, keydown, visibility リスナー登録
    S->>S: loadAllAssets() SVGスプライト読込
    S->>S: initState() GameState+WaveRuntime生成
    S->>S: createHUD() DOM バインディング
    S->>S: input.attach(canvas, camera)
    S->>M: showMainMenu()
    S->>L: scheduleLoop()

    Note over M: ユーザーが「ゲーム開始」クリック

    M->>L: running=true, inMenu=false
    loop 毎フレーム
        L->>L: processInput()
        L->>L: while accumulator≥FIXED_DT: update()
        L->>L: syncHUD()
        L->>L: render()
    end
```

### ゲームループ詳細

```mermaid
flowchart TD
    A["loop(now)"] --> B["dt = (now-lastTime)/1000, cap 0.1s"]
    B --> C{running && !inMenu?}

    C -- Yes --> D[processInput]
    D --> E[accumulator += dt]
    E --> F{"accumulator ≥ FIXED_DT?"}
    F -- Yes --> G["update(FIXED_DT)"]
    G --> H[accumulator -= FIXED_DT]
    H --> F
    F -- No --> I[syncHUD]
    I --> J[updatePanel 選択パネル]

    C -- No --> K[input.consumeActions 蓄積防止]

    J --> L[render]
    K --> L
    L --> M[requestAnimationFrame loop]
```

## 入力 → アクション変換

```mermaid
flowchart TD
    TAP["tap(wx,wy)"] --> HN{hitTestNode?}
    HN -- Yes --> SN[selectNode]
    HN -- No --> HS{hitTestEmptySlot?}
    HS -- Yes --> PT[placeTower]
    HS -- No --> HE{hitTestEdge?}
    HE -- Yes --> SE[selectEdge]
    HE -- No --> DS[deselect]

    DGS["drag-start(wx,wy)"] --> DN{hitTestNode?}
    DN -- Yes --> DF[dragFromNodeId 記録]

    DGE["drag-end(wx,wy)"] --> TN{hitTestNode release位置}
    TN -- "Yes & fromId≠toId" --> CE["purchase(create-edge)"]

    ZOOM[zoom] --> CZ[camera.zoomAt]
    PAN[pan] --> CP[camera.pan]
```

## HUDコールバック対応表

```mermaid
flowchart LR
    subgraph HUDCallback
        SG[start-game]
        RS[restart]
        SW[start-wave]
        ST[select-tool]
        UT[upgrade-tower]
        DT[destroy-tower]
        TT[toggle-tower]
        RT[repair-tower]
        UE[upgrade-edge]
        DE2[destroy-edge]
        RE[reverse-edge]
        TE[toggle-edge]
        RPE[repair-edge]
        BH[base-heal]
    end

    SG --> A1[initState + centerCamera + running=true]
    RS --> A2[initState + showMainMenu]
    SW --> A3[skipBonus加算 + startWave]
    ST --> A4[ui.selectedTool更新]
    UT --> A5["purchase(upgrade-tower)"]
    DT --> A6[refund + deselect]
    TT --> A7["active ↔ disabled"]
    RT --> A8[repairingNodesトグル]
    UE --> A9["パケット消去 + purchase(upgrade-edge)"]
    DE2 --> A10[パケット消去 + edges.delete + 返金]
    RE --> A11["from ↔ to + パケット消去"]
    TE --> A12["active ↔ disabled"]
    RPE --> A13[repairingEdgesトグル]
    BH --> A14[baseRepairingトグル]
```

## 修理システム

```mermaid
flowchart TD
    A[processRepairs dt] --> B[repairingNodes]
    B --> C["heal = REPAIR_RATE_TOWER * dt (40HP/s)"]
    C --> D["cost = heal * 0.3$/HP"]
    D --> E{resources ≥ cost?}
    E -- Yes --> F[node.hp += heal]
    F --> G{hp ≥ maxHp?}
    G -- Yes --> H[修理完了 セットから除去]

    A --> I[repairingEdges]
    I --> J["heal = REPAIR_RATE_EDGE * dt (20HP/s)"]
    J --> K["cost = heal * 0.125$/HP"]

    A --> L[baseRepairing]
    L --> M["heal = REPAIR_RATE_TOWER * dt"]
    M --> N["cost比率 = 20$/HP"]
```

## hud.ts — Preact Signals

### HUDSignals

| Signal | ソース |
|---|---|
| `baseHp` | `state.baseHp` |
| `resources` | `state.resources` |
| `waveIndex` | `state.waveIndex` |
| `enemyCount` | `state.enemies.size` |
| `gameResult` | `state.gameResult` |
| `waveCountdown` | `waveRuntime.waveCountdown` |
| `hpPercent` | computed: `baseHp / maxBaseHp * 100` |

### パネル更新フロー

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant GA as GameApp
    participant HUD as hud.ts
    participant DOM as DOM要素

    U->>GA: タワーをタップ
    GA->>GA: selectNode(nodeId)
    GA->>HUD: updateTowerPanel(state, config, nodeId)
    HUD->>DOM: ステータス値を反映
    HUD->>DOM: 修理ボタン: hp<maxHp → 表示
    HUD->>DOM: 強化ボタン: 状態に応じてdisabled
    HUD->>DOM: トグルボタン: active→停止 / disabled→起動
```

## index.html DOM構造

```mermaid
flowchart TD
    GC["#game-container"] --> TB["#top-bar"]
    TB --> TS1[".top-stat HP/$/ Wave/Enemy"]
    TB --> BH["#btn-base-heal"]
    TB --> BW["#btn-wave"]

    GC --> MA["#main-area"]
    MA --> CA["#canvas-area > #game-canvas"]
    MA --> SB["#sidebar"]
    SB --> TH["#tab-header 建設/情報"]
    SB --> TBD["#tab-build .tool-btn ×6"]
    SB --> TI["#tab-info"]
    TI --> IE["#info-empty"]
    TI --> TWI["#tower-info .repair-btn + stats"]
    TI --> EI["#edge-info .repair-btn + stats"]

    GC --> MM["#main-menu オーバーレイ"]
    GC --> GO["#game-over"]
    GC --> GV["#game-victory"]
    GC --> RO["#rotate-overlay 縦向きモバイル"]
```
