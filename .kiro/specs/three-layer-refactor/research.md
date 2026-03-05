# Research & Design Decisions

## Summary
- **Feature**: `three-layer-refactor`
- **Discovery Scope**: Extension（既存システムのリファクタリング）
- **Key Findings**:
  - Core層にCanvas2D依存が2箇所（Camera.applyTransform, InputManager全体）
  - GameConfigにステージ固有データ（waveDefs, enemyPath, basePos, nodeSlots）が混在
  - processHeldPacketが巨大switch文、敵行動が文字列ベースdispatch — Strategy pattern導入対象

## Research Log

### Core層のブラウザAPI依存箇所
- **Context**: Core層を描画API非依存にするため、現在の依存箇所を特定
- **Findings**:
  - `core/camera.ts`: `applyTransform(ctx: CanvasRenderingContext2D)`, `resetTransform(ctx)` の2メソッドがCanvas2D依存
  - `core/input.ts`: 全体がHTMLCanvasElement依存（attach, pointerイベント, getBoundingClientRect）
  - 純粋な座標変換（screenToWorld, worldToScreen, zoomAt, pan）はCanvas2D非依存
- **Implications**: Camera状態+数学はCoreに残し、ctx操作をBrowserに分離。InputManagerは丸ごとBrowser層へ移動

### GameConfigのステージ固有データ
- **Context**: StageData分離のためGameConfig内のステージ固有フィールドを特定
- **Findings**:
  - ステージ固有: `waveDefs`, `enemyPath`, `basePos`, `nodeSlots`
  - ゲーム共通: `PACKET_SPEED`, `MAX_LEVEL`, `towerLevels`, `edgeLevels`, `enemyTypes`, 各種コスト等
- **Implications**: 4フィールドをStageDataに移動。GameConfigの型定義からこれらを除外

### TowerNodeの現状
- **Context**: Discriminated Union化の対象確認
- **Findings**:
  - 現在はフラット構造: 全ノードタイプが同一interfaceで `ammo`, `held`, `cooldown`, `facingAngle` を持つ
  - generatorはammo/held不要、attack nodeはnextOut不要
  - 現状のprocessHeldPacketがtype文字列でswitch分岐（~110行）
- **Implications**: 段階的に移行可能。まずStrategy pattern導入でswitch解消、その後型分離は任意

### 敵行動パターンの現状
- **Context**: EnemyBehavior Strategy化の対象確認
- **Findings**:
  - `config.enemyTypes[type].behavior: 'path' | 'edgeAttack' | 'towerAttack'`
  - wave.ts内のupdateEnemiesでbehavior文字列によるif分岐
  - combat.ts内のcreateEnemyShotでedgeAttack/towerAttackの分岐
  - disablerは`behavior: 'path'`だが特殊処理あり
- **Implications**: behaviorMapでEnemyBehavior interfaceにdispatch。既存の3パターン+disablerを実装

### Effect管理の現状
- **Context**: Effect型のCore配置とレンダリングのBrowser配置を確認
- **Findings**:
  - Effect型はcore/types.tsで定義済み（type, x, y, timer, duration, color, params）
  - 生成: game/renderer.ts内のaddMuzzleEffect等（state.effects.pushする）
  - 更新: renderer.ts内のupdateEffects/updateEffectPositions
  - 描画: renderer.ts内のdrawEffects
  - combat.tsがrenderer.tsの関数を呼んでエフェクト生成 → 循環依存リスク
- **Implications**: Effect型+更新ロジックはCoreに残す。エフェクト生成もCoreサービス内で行う（state.effects.push）。描画のみBrowser

### vitest導入
- **Context**: テストフレームワーク選定
- **Findings**:
  - Viteプロジェクトなのでvitestが最適（設定共有、パスエイリアス自動解決）
  - 現在テスト設定なし（package.jsonにtest scriptなし）
  - devDependenciesにvitest追加のみで導入可能
- **Implications**: `vitest.config.ts`作成、`npm run test`スクリプト追加

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Strategy + View Interface | processorMap/behaviorMapでdispatch、View interfaceで疎結合 | テスト容易、OCP準拠、既存コードを段階移行可能 | Map lookupのオーバーヘッド（無視可能） | domain-model.mdで確定済み |
| Discriminated Union + Pattern Matching | TowerNode型をunion化し、type narrowingで処理 | TypeScript型安全性が最大 | 既存コードの大規模変更が必要 | Strategy導入後に段階的に検討 |

## Design Decisions

### Decision: TowerNode Discriminated Union化は後回し
- **Context**: 型安全性向上のためTowerNode union化を検討
- **Selected Approach**: まずStrategy pattern導入でswitch解消。union化は別specで実施
- **Rationale**: union化は型定義変更+全参照箇所の修正で影響範囲が大きい。Strategy導入だけで主要な品質向上目標は達成可能
- **Trade-offs**: 型レベルの厳密性は後回し / リファクタリング範囲を制御可能

### Decision: エフェクト生成のCoreサービス内実施
- **Context**: 現在combat.tsがrenderer.tsのaddMuzzleEffect等を呼んでいる
- **Selected Approach**: Effect生成（state.effects.push）はCoreサービス（combat.ts等）内で直接実施
- **Rationale**: エフェクトはゲームイベントに紐づくシミュレーションデータ。Coreで生成しBrowserで描画する
- **Trade-offs**: Coreがビジュアル情報（色、パーティクル数）を知る / 描画とデータの分離は明確

### Decision: InputManagerのBrowser層移動
- **Context**: InputManagerはHTMLCanvasElementに完全依存
- **Selected Approach**: InputManagerをBrowser層に移動。Core層にはInputAction型のみ残す
- **Rationale**: Pointer Events APIはブラウザ固有。Core層はInputAction型を受け取るだけで十分

## Risks & Mitigations
- **リグレッション**: テスト先行（vitest導入→テスト作成→リファクタリング）で緩和
- **大規模変更の衝突**: 段階的移行（1ファイルずつ移動・テスト確認）
- **renderer.ts分離時のimport循環**: Browser層rendererがCoreサービスの関数（chargeOnEdge等）を使用 → CoreからView経由で提供
