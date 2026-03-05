# Requirements Document

## Introduction

現在のコードベースを3層アーキテクチャ（Core/Game/Browser）にリファクタリングし、テスト可能性と品質を向上させる。
Core層を描画API非依存の純粋シミュレーションとすることで、vitestによるヘッドレステストを実現し、
SOLID原則に基づくStrategy pattern導入でノード処理・敵行動の拡張性を確保する。

参照: `mockup/components/domain-model.md`（確定済みドメインモデル）

## Requirements

### Requirement 1: Core層の描画API非依存化
**Objective:** 開発者として、Core層がブラウザAPIに依存しないようにしたい。vitestでヘッドレステストを実行でき、シミュレーターやバランス調整ツールからCore単体で利用できるようにするため。

#### Acceptance Criteria
1. The Core層 shall Canvas2D, DOM, ブラウザAPI（`CanvasRenderingContext2D`, `HTMLElement`, `window`, `document`等）を一切importしない
2. When Core層の全ファイルをimportした場合, the ビルドシステム shall ブラウザ環境なしでTypeScriptコンパイルが成功する
3. The Core層 shall シミュレーションロジック（network, combat, wave, economy）、データ型、Camera座標変換（純粋数学）、Effectタイマー更新を含む
4. The Camera shall `screenToWorld`・`worldToScreen`・`zoomAt`を純粋な数値計算として提供し、`ctx`パラメータを受け取らない

### Requirement 2: Game層のフロー統合責務
**Objective:** 開発者として、Game層をCoreサービスの組み合わせ方を定義するフロー統合層にしたい。具体的なシミュレーションロジックと分離することで、ゲームフロー変更時にCore層への影響を防ぐため。

#### Acceptance Criteria
1. The GameFlow shall Coreサービス（NetworkService, CombatService, WaveService, EconomyService）の呼び出し順序を制御する
2. The Game層 shall 具体的なシミュレーションロジック（パケット移動、ダメージ計算等）を含まない
3. The ScoringService shall Core層のMetricsStoreを読み取って3軸スコア（構築力・可用性・信頼性）を集計する
4. The GameEndService shall GameStateを参照してゲームクリア/敗北を判定する

### Requirement 3: Browser層の描画・UI責務
**Objective:** 開発者として、Canvas2D描画とDOM操作をBrowser層に集約したい。描画実装の変更（WebGL移行等）がCore/Game層に影響しないようにするため。

#### Acceptance Criteria
1. The Renderer shall Canvas2Dを使用してGameStateとCamera情報からゲーム画面を描画する
2. The CameraBinding shall `ctx.setTransform`等のCanvas2Dバインディングを提供し、Core層のCamera状態を画面に反映する
3. The InputManager shall Pointer Eventsをキャプチャし、InputAction型に変換してGame層に提供する
4. The HUD shall Preact SignalsとDOM操作でゲーム情報パネルを更新する

### Requirement 4: StageData分離
**Objective:** 開発者として、ステージ固有データ（敵経路・ウェーブ定義）をGameConfigから分離したい。複数ステージを定義・切り替え可能にし、バランス調整ツールで個別テストできるようにするため。

#### Acceptance Criteria
1. The StageData shall `id`, `enemyPath`, `waveDefs`をステージ固有の不変データとして保持する
2. The GameConfig shall ゲーム共通定数（`MAX_LEVEL`, `PACKET_SPEED`, `towerLevels`, `edgeLevels`等）のみを保持し、`enemyPath`・`waveDefs`を含まない
3. When 新しいステージを追加する場合, the 開発者 shall `core/stages/`に新しいStageDataファイルを追加するだけで実現できる
4. The WaveService shall StageDataを引数として受け取り、ステージ固有の敵経路・ウェーブ定義を使用する

### Requirement 5: NodeProcessor Strategy（OCP準拠）
**Objective:** 開発者として、ノードタイプ別のheld処理をStrategy patternで分離したい。新しいノードタイプ追加時に既存コードを変更せず、各処理を独立テストできるようにするため。

#### Acceptance Criteria
1. The NetworkService shall `processorMap`を使用してノードタイプからNodeProcessorへディスパッチする
2. When 新しいノードタイプを追加する場合, the 開発者 shall NodeProcessorインターフェースを実装し`processorMap`にエントリを追加するだけで実現できる（既存Processor変更不要）
3. The RepeaterProcessor shall held 1件を消費し、charge=1+boost のパケットを1エッジに送出する
4. The DistributorProcessor shall held 1件を消費し、charge=1 のパケットをfanout数のエッジに送出する
5. The AttackProcessor shall held 1件を消費し、ammo += 1 に変換する（charge>1の場合は残りを再キュー）

### Requirement 6: EnemyBehavior Strategy（OCP準拠）
**Objective:** 開発者として、敵タイプ別の行動パターンをStrategy patternで分離したい。新しい敵タイプ追加時に既存コードを変更せず拡張できるようにするため。

#### Acceptance Criteria
1. The WaveService shall `behaviorMap`を使用して敵タイプからEnemyBehaviorへディスパッチする
2. When 新しい敵タイプを追加する場合, the 開発者 shall EnemyBehaviorインターフェースを実装し`behaviorMap`にエントリを追加するだけで実現できる
3. The PathBehavior shall 経路移動のみを行い、弾を撃たない
4. The EdgeAttackBehavior shall 経路移動しながら射程内のランダムEdgeを攻撃する
5. The TowerAttackBehavior shall 経路移動しながら射程内のランダムNodeを攻撃する

### Requirement 7: View Interface（ISP準拠）
**Objective:** 開発者として、サービス間の結合度を下げたい。各サービスが必要なデータのみを参照するView interfaceを導入することで、テスト時のモック作成を容易にするため。

#### Acceptance Criteria
1. The NetworkService shall NetworkView（nodes, edges, packets, metrics）のみを参照する
2. The CombatService shall CombatView（nodes, enemies, bullets, enemyBullets, edges, packets, effects, resources, metrics）のみを参照する
3. The WaveService shall WaveView（enemies, enemyBullets, nodes, edges, effects, baseHp, waveIndex, wavePhase）のみを参照する
4. The EconomyService shall EconomyView（nodes, edges, packets, resources, metrics）のみを参照する
5. The GameState shall 全てのView interfaceを満たす（satisfies）

### Requirement 8: vitest導入とテストカバレッジ
**Objective:** 開発者として、vitestによる自動テストを導入したい。リファクタリング中および今後の変更時にリグレッションを検出し、品質を維持するため。

#### Acceptance Criteria
1. When `npm run test`を実行した場合, the vitest shall Core層・Game層の全ユニットテストをヘッドレスで実行する
2. The テストスイート shall 各NodeProcessor（Repeater, Distributor, Attack）の単体テストを含む
3. The テストスイート shall emitPacketの容量チェック・部分送信のテストを含む
4. The テストスイート shall パケット到着時のcharge分解・maxQueue制御のテストを含む
5. The テストスイート shall Generator→Edge→Repeater→Edge→Distributorの統合フローテストを含む
6. The テストスイート shall スコア計算ロジック・ゲーム終了判定のテストを含む
7. When テストがCIで実行された場合, the テストスイート shall ブラウザ環境なしで全テストがパスする

### Requirement 9: 既存機能の動作保証
**Objective:** プレイヤーとして、リファクタリング後もゲームが以前と同じように動作してほしい。内部構造の変更がゲーム体験に影響しないようにするため。

#### Acceptance Criteria
1. The リファクタリング後のゲーム shall パケット生成・移動・到着・ノード処理のライフサイクルがdomain-model.mdの確定仕様と一致する
2. The リファクタリング後のゲーム shall 全30ウェーブをプレイ可能で、勝利・敗北判定が正常に動作する
3. The リファクタリング後のゲーム shall タワー建設・アップグレード・売却・修理が正常に動作する
4. The リファクタリング後のゲーム shall Canvas2Dによるゲーム画面描画とDOM HUDが正常に動作する
5. The `npm run build` shall TypeScriptコンパイルエラーなしでプロダクションビルドが成功する

### Requirement 10: 依存方向の強制
**Objective:** 開発者として、層間の依存方向（Browser→Game→Core）を厳密に守りたい。逆方向依存が混入するとテスタビリティと保守性が崩れるため。

#### Acceptance Criteria
1. The Core層 shall Game層・Browser層のモジュールをimportしない
2. The Game層 shall Browser層のモジュールをimportしない
3. The パスエイリアス shall `@core/` → `src/core/`、`@game/` → `src/game/`、`@browser/` → `src/browser/`として設定される
4. When 逆方向のimportが記述された場合, the TypeScriptコンパイル shall エラーを検出する（将来的にESLintルール等で強制可能）
