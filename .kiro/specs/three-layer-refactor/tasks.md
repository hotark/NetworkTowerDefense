# Implementation Plan

- [x] 1. テスト基盤・パスエイリアスセットアップ
  - vitestをdevDependencyに追加し、ヘッドレス実行用の設定ファイルを作成する
  - 3層パスエイリアス（@core, @game, @browser）をビルド設定とテスト設定の両方に反映する
  - npm run test / test:watch スクリプトを追加し、ブラウザ環境なしで実行できることを確認する
  - _Requirements: 8.1, 8.7, 10.3_

- [x] 2. Core共通基盤の構築
- [x] 2.1 (P) 共通座標演算基盤の構築
  - 各ドメインに散在する距離計算・ベクトル演算を1箇所に集約する
  - Vec2型、距離・距離二乗・正規化・スケール・加減算・線形補間・点と円の判定・線分最近点を提供する
  - 全て純粋関数・副作用なしとし、Core全域から参照可能にする
  - _Requirements: 1.3_

- [x] 2.2 (P) DomainTickインターフェースとタイマーユーティリティの定義
  - ドメイン別Tick処理の共通契約（tick関数シグネチャ）を定義する
  - クールダウンデクリメント・準備判定の共通ユーティリティを提供する
  - GameFlow（Game層）がこのインターフェースを参照する前提で、依存方向Core←Gameを維持する
  - _Requirements: 2.1_

- [x] 2.3 (P) エフェクトライフサイクル管理の共通化
  - エフェクト追加ヘルパー、タイマー減算による期限切れ削除、弾道追従座標同期を共通モジュールに集約する
  - 現在renderer.ts内にある更新ロジック（updateEffects, updateEffectPositions）からCanvas2D依存を除去して抽出する
  - 各ドメインのエフェクト生成がこの基盤を利用する形にする
  - _Requirements: 1.1, 1.3_

- [x] 3. Core型・データ基盤の整備
- [x] 3.1 (P) サービス別View Interfaceの定義
  - NetworkView, CombatView, WaveView, EconomyViewの4つのView Interfaceを定義する
  - 各サービスが必要なデータのみを参照する部分射影としてISP準拠を実現する
  - GameStateが全ViewをTypeScript型チェックで満たすことを検証する
  - テスト時に軽量モックオブジェクトで代替可能にする
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3.2 (P) ステージ固有データの分離
  - StageDataインターフェース（id, 敵経路, ウェーブ定義, 拠点位置, ノードスロット）を定義する
  - GameConfigからステージ固有の4フィールドを除外し、ゲーム共通定数のみに整理する
  - 現在のステージデータをステージ1データファイルとして作成する
  - WaveServiceが StageDataを引数として受け取るように全参照箇所を更新する
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 3.3 (P) カメラの純粋数学化
  - Camera classからctx依存メソッド（applyTransform, resetTransform）を除去する
  - 座標変換（screenToWorld, worldToScreen）, zoom, panを純粋な数値計算関数として維持する
  - InputAction型定義をCore側に配置し、Core/Gameから参照可能にする
  - _Requirements: 1.1, 1.4_

- [x] 4. パケットシステムのドメイン分割とStrategy化
- [x] 4.1 (P) パケット処理ロジックの責務分離
  - network.tsを、ロジック（容量チェック・charge規則・emit共通ヘルパー）、座標計算（packetPosition）、Tickオーケストレーション（tickGenerators・updatePackets・tickHeldPackets）に分割する
  - 共通座標演算とDomainTickインターフェースを利用する
  - NetworkViewを引数として受け取る形に変更する
  - 4.1, 5.1, 7は異なるソースファイルを操作するため同時実行可能
  - _Requirements: 1.3_

- [x] 4.2 NodeProcessor Strategyの実装
  - NodeProcessor interfaceを定義し、processorMapディスパッチを導入する
  - RepeaterProcessor（charge=1+boost送出）、DistributorProcessor（charge=1×fanout送出）、AttackProcessor（ammo+=1変換、charge>1は再キュー）を個別に実装する
  - 既存processHeldPacketのswitch文を各Processorに分解し、新規ノードタイプ追加時に既存コード変更不要にする
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. 戦闘システムのドメイン分割
- [x] 5.1 (P) 戦闘ロジックの責務分離
  - combat.tsを、ロジック（ダメージ計算・命中判定）、座標計算（射程判定・弾道計算）、Tickオーケストレーション（updateTowerAttacks・updateBullets・updateEnemyBullets）に分割する
  - 共通座標演算とDomainTickインターフェースを利用する
  - CombatViewを引数として受け取る形に変更する
  - _Requirements: 1.3_

- [x] 5.2 エフェクト生成のCore基盤連携
  - マズルフラッシュ・爆発・着弾等のエフェクト生成を、共通エフェクト基盤のaddEffect経由に変更する
  - エフェクト型・座標・色・パラメータの定義のみをCore側に保持し、Canvas2D描画コードを含めない
  - 現在renderer.tsで行っているエフェクト追加呼び出しを、Core戦闘ドメイン内に移動する
  - _Requirements: 1.1, 1.3_

- [x] 6. ウェーブシステムのドメイン分割とStrategy化
- [x] 6.1 ウェーブ管理ロジックの責務分離
  - wave.tsを、ロジック（スポーン規則・経路移動計算）とTickオーケストレーション（updateWaveSpawning・updateEnemies）に分割する
  - StageDataを引数として受け取り、ステージ固有の敵経路・ウェーブ定義を使用する
  - WaveViewを引数として受け取る形に変更する
  - タスク5（戦闘システム）完了後に実施する（createEnemyShotの移動元がcombat.ts）
  - _Requirements: 1.3, 4.4_

- [x] 6.2 EnemyBehavior Strategyの実装
  - EnemyBehavior interfaceを定義し、behaviorMapディスパッチを導入する
  - PathBehavior（経路移動のみ）、EdgeAttackBehavior（移動+Edge攻撃）、TowerAttackBehavior（移動+Node攻撃）を個別に実装する
  - 既存のupdateEnemies内if分岐とcreateEnemyShotロジックを各Behaviorに移動し、新規敵タイプ追加時に既存コード変更不要にする
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. 経済システムのドメイン分割
  - economy.tsを、ロジック（コスト計算・リソース管理ルール）とTickオーケストレーション（updateBuildTimers）に分割する
  - DomainTickインターフェースを実装し、EconomyViewを引数として受け取る形に変更する
  - タスク4.1, 5.1と同時実行可能（異なるソースファイル）
  - _Requirements: 1.3_

- [x] 8. Game層フロー統合の構築
- [x] 8.1 GameFlowオーケストレーターの実装
  - addTick登録パターンによるDomainTick順序実行のオーケストレーターを作成する
  - Network→Combat→Wave→Economyの順にDomainTick実装を登録する
  - game-app.tsのupdate()内にあるシミュレーション呼び出しロジックをGameFlowに抽出する
  - GameFlow自体はドメインロジックを持たず、登録順に呼び出すだけであることを確認する
  - _Requirements: 2.1, 2.2_

- [x] 8.2 (P) ゲーム終了判定の抽出
  - game-app.ts内の勝利/敗北判定ロジックをGame層の独立モジュールに分離する
  - GameStateを参照してゲーム結果（勝利・敗北・継続）を判定する純粋関数として実装する
  - _Requirements: 2.4_

- [x] 8.3 (P) スコアリングサービスの配置
  - 既存scoring.tsをGame層に配置し、MetricsStoreから3軸スコア（構築力・可用性・信頼性）を集計する機能を維持する
  - import元をGame層パスに変更し、Core MetricsStoreのみを参照する
  - _Requirements: 2.3_

- [x] 9. Browser層への描画・入力の集約
- [x] 9.1 Canvas2D描画のBrowser層移動とエフェクト描画の整理
  - renderer.tsをBrowser層に移動する
  - エフェクト描画はstate.effects配列を読み取り、Effect.typeに基づいてCanvas2Dで視覚表現する（drawEffects）
  - エフェクトの種類別描画ロジック（マズルフラッシュ・爆発・着弾等）はRenderer内に実装する
  - Core側のエフェクト生成・更新ロジックとの分離を確認する（Coreはデータのみ、Browserは描画のみ）
  - _Requirements: 3.1_

- [x] 9.2 (P) カメラバインディングの作成
  - Core Camera状態をCanvas2D contextに適用するバインディングモジュールをBrowser層に作成する
  - 既存Camera classのapplyTransform/resetTransformをこのモジュールに移動する
  - _Requirements: 3.2_

- [x] 9.3 (P) 入力マネージャーのBrowser層移動
  - 既存core/input.tsをBrowser層に移動する
  - Pointer EventsをInputAction型に変換する既存機能を維持する
  - InputAction型定義はCore側に残す（タスク3.3で対応済み）
  - _Requirements: 3.3_

- [x] 9.4 HUDのimport整理
  - HUDモジュールがGame/Networkを直接importしている箇所をCore参照に切り替える
  - Preact Signals/DOM操作がBrowser層で完結していることを確認する
  - _Requirements: 3.4_

- [x] 10. 全体統合と依存方向検証
- [x] 10.1 GameApp更新とGameFlow統合
  - GameAppからGameFlow経由でCoreサービスを呼び出す構造に変更する
  - ゲームループ（accumulate dt → GameFlow.tick → render → syncHUD）の正常動作を確認する
  - パケット生成・移動・戦闘・ウェーブ・経済・エフェクト・スコアの全機能が統合後に正常に動作することを確認する
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10.2 依存方向の検証とプロダクションビルド
  - Core層がGame層・Browser層のモジュールを一切importしていないことを確認する
  - Game層がBrowser層のモジュールをimportしていないことを確認する
  - tsc --noEmitで型エラーがゼロであることを確認する
  - npm run buildでプロダクションビルドが成功することを確認する
  - Core層ファイルのみをimportした場合にブラウザ環境なしでコンパイル成功することを検証する
  - _Requirements: 1.2, 9.5, 10.1, 10.2, 10.4_

- [x] 11. テストスイート構築
- [x] 11.1 (P) 共通基盤のテスト
  - 座標演算のテスト: 距離計算、正規化、線形補間、点と円の判定、線分最近点
  - エフェクト管理のテスト: エフェクト追加、タイマー更新による期限切れ削除、弾道追従座標同期
  - タイマーユーティリティのテスト: クールダウンデクリメント、準備判定
  - _Requirements: 8.1_

- [x] 11.2 (P) NodeProcessorのテスト
  - Repeaterテスト: charge=1+boost送出、全エッジ拒否時の再キュー
  - Distributorテスト: charge=1×fanout送出、maxQueue制御
  - Attackテスト: ammo+=1変換、charge>1の残り再キュー
  - _Requirements: 8.2_

- [x] 11.3 (P) パケットシステムのテスト
  - emitPacketの容量チェック・部分送信の正確性テスト
  - パケット到着時のcharge分解・maxQueue制御テスト
  - Camera座標変換（screenToWorld/worldToScreen）の正確性テスト
  - _Requirements: 8.3, 8.4_

- [x] 11.4 パケットフロー統合テスト
  - Generator→Edge→Repeater→Edge→Distributorの一貫フローを検証する
  - パケットライフサイクル全4フェーズ（生成→移動→到着→ノード処理）の整合性を確認する
  - 11.1〜11.3の完了後に実施する（個別テストが前提）
  - _Requirements: 8.5_

- [x] 11.5 (P) スコア・ゲーム終了判定のテスト
  - MetricsStoreからThreeAxisScores（構築力・可用性・信頼性）への計算正確性テスト
  - 勝利条件（全ウェーブクリア）・敗北条件（baseHp <= 0）の判定テスト
  - GameFlowのCoreサービス呼び出し順序の検証テスト
  - _Requirements: 8.6_

- [x] 11.6 ヘッドレスビルド検証
  - npm run testで全テストスイートがヘッドレス（node環境）で成功することを確認する
  - ブラウザ環境なしでの実行を保証し、CI環境での利用を想定する
  - _Requirements: 8.7_
