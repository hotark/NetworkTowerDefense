# Requirements Document

## Introduction

Network Tower Defenceの本番プロジェクト。mockup/part003で検証済みのゲームメカニクスを、
TypeScript + Vite + Canvas2Dで本番品質のコードとして構築する。
3層アーキテクチャ（Core/Game/Browser）、MVP設計、モバイル対応カメラを含む。

スコープ: ゲームプレイ完成＋スコアリングまで。ランキング登録機能は後続スペックで実装する。

---

## Requirements

### Requirement 1: プロジェクト基盤

**Objective:** As a 開発者, I want TypeScript + Viteの本番プロジェクトが構築されている, so that 型安全かつ高速なビルド環境で開発できる

#### Acceptance Criteria
1. The Game shall TypeScript strict modeでコンパイルエラーなくビルドできる
2. The Game shall `npm run dev` でVite dev serverが起動し、HMRが動作する
3. The Game shall `npm run build` で静的ファイルが `dist/` に出力される
4. The Game shall 3層ディレクトリ構造（`src/core/`, `src/game/`, `src/browser/`）で構成される
5. The Game shall Core層がGame層・Browser層に依存しない（importが存在しない）
6. The Game shall Game層がBrowser層に依存しない（importが存在しない）
7. The Game shall パスエイリアス（`@core/`, `@game/`, `@browser/`）でimportできる

### Requirement 2: ゲームループ

**Objective:** As a プレイヤー, I want 安定したフレームレートでゲームが動作する, so that デバイス性能に依存しない一貫したゲーム体験が得られる

#### Acceptance Criteria
1. The Game shall 固定タイムステップ（60fps相当）でゲームロジックを更新する
2. The Game shall 描画をディスプレイのリフレッシュレートに合わせて可変フレームレートで実行する
3. While タブが非アクティブの場合, the Game shall ゲームループを一時停止する
4. If フレーム間隔が100msを超えた場合, the Game shall dtを上限値でクランプしスパイラルを防止する

### Requirement 3: カメラシステム

**Objective:** As a プレイヤー, I want ゲーム画面をズーム・パンできる, so that モバイルの小さい画面でもノードやエッジを操作できる

#### Acceptance Criteria
1. When マウスホイールを回転させた時, the Game shall ホイール位置を中心にズームイン/アウトする
2. When 2本指でピンチ操作した時, the Game shall ピンチ中心を基準にズームイン/アウトする
3. When 2本指でドラッグした時, the Game shall カメラをパン（平行移動）する
4. The Game shall ズーム倍率を最小値〜最大値の範囲に制限する
5. The Game shall すべてのCanvas描画にカメラ変換（translate + scale）を適用する
6. The Game shall すべてのタッチ/マウス入力座標をワールド座標に逆変換する
7. The Game shall CSS `touch-action: none` でブラウザデフォルトのジェスチャーを無効化する

### Requirement 4: 入力システム

**Objective:** As a プレイヤー, I want PCでもスマートフォンでも同じ操作でゲームをプレイできる, so that デバイスを問わずゲームを楽しめる

#### Acceptance Criteria
1. The Game shall Pointer Events APIでマウスとタッチを統合的に処理する
2. When 空白エリアをタップした時, the Game shall 選択中のタワー種別をその位置に配置する
3. When ノードからドラッグを開始した時, the Game shall ドラッグ先ノードとのエッジ接続プレビューを表示する
4. When ノードからドラッグしてノード上で離した時, the Game shall 2ノード間にエッジを作成する
5. When ノードまたはエッジをタップした時, the Game shall その要素を選択し詳細パネルを表示する
6. When 1本指操作の場合, the Game shall ゲーム操作（配置・選択・ドラッグ）として処理する
7. When 2本指操作の場合, the Game shall カメラ操作（ズーム・パン）として処理する

### Requirement 5: 状態管理

**Objective:** As a 開発者, I want エンティティがID参照で安全に管理される, so that 要素の追加・削除時にバグが発生しない

#### Acceptance Criteria
1. The Game shall すべてのエンティティ（ノード、エッジ、パケット、敵、弾）をMap<ID, Entity>で管理する
2. The Game shall エンティティ間の参照にID文字列を使用し、配列インデックスを使用しない
3. When エンティティが削除された時, the Game shall そのIDを参照する他エンティティが次回更新で自然に処理される（弾の消滅等）
4. The Game shall 一意なID生成関数を提供する

### Requirement 6: ネットワークトポロジー

**Objective:** As a プレイヤー, I want ノードとエッジでネットワークを構築できる, so that パケットの流れを設計して戦略を立てられる

#### Acceptance Criteria
1. The Game shall 6種類のノードタイプ（生成器、スナイパー、ラピッド、キャノン、分配器、リピーター）を配置できる
2. The Game shall ノード間に有向エッジを作成できる（循環も許容）
3. The Game shall エッジに方向を持たせ、パケットが一方向に流れる
4. When エッジの最大長を超える距離のノード間で接続を試みた時, the Game shall エッジの作成を拒否する
5. The Game shall 各ノードタイプがレベル1〜5のステータスを持つ
6. The Game shall 各エッジがレベル1〜5の容量・速度ステータスを持つ
7. When ノードを撤去した時, the Game shall そのノードに接続された全エッジも削除する

### Requirement 7: パケットシステム

**Objective:** As a プレイヤー, I want パケットがネットワーク上を流れて弾薬を供給する, so that ネットワーク設計の結果が戦闘に直結する

#### Acceptance Criteria
1. When 生成器がパケット生成間隔に達した時, the Game shall 接続エッジにパケットを送出する
2. The Game shall パケットをエッジ上で移動させ、目的ノードに到達させる
3. While エッジの容量上限に達している場合, the Game shall 新たなパケットの送出を待機させる
4. When パケットが攻撃タワーに到達した時, the Game shall パケットをammo（弾薬）に変換する
5. When パケットが分配器に到達した時, the Game shall ラウンドロビンで接続先エッジに転送する
6. When パケットがリピーターに到達した時, the Game shall chargeを増幅して転送する
7. The Game shall ノードでのパケット処理を1 holdTimeサイクルにつきcharge 1つ分とする
8. When パケットが拠点（ベース）に到達した時, the Game shall リソース（通貨）に変換する

### Requirement 8: 戦闘システム

**Objective:** As a プレイヤー, I want 攻撃タワーが敵を迎撃する, so that ネットワークで供給した弾薬が敵の撃退に活かされる

#### Acceptance Criteria
1. While 攻撃タワーがammoを保持し射程内に敵がいる場合, the Game shall クールダウン経過後に弾を発射する
2. The Game shall 弾をターゲットに向けて追尾移動させる
3. When 弾がターゲットに命中した時, the Game shall タワー種別・レベルに応じたダメージを与える
4. If 弾の飛行中にターゲットのHPが0になった場合, the Game shall 弾をターゲットの最終位置まで慣性飛行させダメージなしで消滅させる
5. The Game shall 3種類の攻撃タワー（スナイパー: 高火力低速、ラピッド: 低火力高速、キャノン: 範囲攻撃中速）を提供する
6. The Game shall 攻撃タワーがammoPerShot分のパケットを1発あたり消費する
7. The Game shall 拠点（ベース）に基本的な攻撃能力を持たせる

### Requirement 9: 敵システム

**Objective:** As a プレイヤー, I want 多様な敵が出現する, so that 異なる戦略が求められるやりごたえのあるゲームになる

#### Acceptance Criteria
1. The Game shall 敵を固定経路（ウェイポイント）に沿って移動させる
2. When 敵が拠点に到達した時, the Game shall ベースHPにダメージを与える
3. When 敵のHPが0になった時, the Game shall リソース報酬を付与し敵を除去する
4. The Game shall 6種類の敵タイプ（ノーマル、ファスト、タンク、エッジ攻撃、タワー攻撃、ディスエーブラー）を提供する
5. While エッジ攻撃タイプの敵が射程内にエッジを検知した場合, the Game shall そのエッジにダメージを与える
6. While タワー攻撃タイプの敵が射程内にタワーを検知した場合, the Game shall そのタワーにダメージを与える
7. When ディスエーブラーが射程内のタワーまたはエッジに到達した時, the Game shall 対象を一定時間無効化する（パケット処理・攻撃が停止）
8. While タワーまたはエッジが無効化されている間, the Game shall 無効化状態を視覚的に表示する
9. When エッジのHPが0になった時, the Game shall そのエッジを破壊する
10. When タワーのHPが0になった時, the Game shall そのタワーを破壊し接続エッジも削除する

### Requirement 10: ウェーブシステム

**Objective:** As a プレイヤー, I want ウェーブごとに敵が強くなっていく, so that 段階的にネットワークを拡張する動機が生まれる

#### Acceptance Criteria
1. The Game shall 30ウェーブの敵構成を定義データとして持つ
2. When プレイヤーがウェーブ開始を指示した時, the Game shall 定義に従って敵をスポーンさせる
3. When 全ウェーブの全敵を倒した時, the Game shall ゲームクリアとする
4. When ベースHPが0になった時, the Game shall ゲームオーバーとする
5. While ウェーブ間の準備フェーズ中, the Game shall プレイヤーにタワー配置・強化の時間を与える
6. The Game shall ウェーブ後半で敵の強度（str）を段階的に上昇させる

### Requirement 11: 経済システム

**Objective:** As a プレイヤー, I want リソースを使ってタワーとエッジを強化できる, so that タワー強化 vs ネットワーク拡張の投資判断ができる

#### Acceptance Criteria
1. The Game shall パケットのベース到達と敵撃破によりリソースを獲得する
2. When プレイヤーがタワー配置を指示した時, the Game shall 配置コスト分のリソースを消費する
3. When プレイヤーがタワーアップグレードを指示した時, the Game shall レベル別コスト分のリソースを消費する
4. When プレイヤーがエッジアップグレードを指示した時, the Game shall レベル別コスト分のリソースを消費する
5. If リソースが不足している場合, the Game shall 配置・アップグレードを拒否する
6. While タワーが建設中の場合, the Game shall 建設時間経過後にタワーを有効化する
7. While タワーがアップグレード中の場合, the Game shall アップグレード時間経過後にレベルを上げる
8. When プレイヤーがタワーを撤去した時, the Game shall コストの一部をリソースとして返却する

### Requirement 12: 描画システム

**Objective:** As a プレイヤー, I want ゲーム要素が視覚的に明確に表示される, so that ネットワークの状態と戦況を直感的に把握できる

#### Acceptance Criteria
1. The Game shall Canvas 2D APIで全ゲーム要素を描画する
2. The Game shall エッジの輻輳状態を色のグラデーション（青→黄→赤）で表示する
3. The Game shall タワーのレベルに応じたSVGスプライトを表示する
4. The Game shall レベル3以上のタワーにグロー・リングエフェクトを表示する
5. The Game shall レベル3以上のエッジに二重線表示を行う
6. The Game shall パケットをチャージ数付きで表示する
7. The Game shall 敵をタイプ別の形状（丸、三角、ひし形、四角、六角）で表示する
8. The Game shall 描画順を背景→エッジ→パケット→ノード→敵→弾→エフェクトの順にする

### Requirement 13: エフェクトシステム

**Objective:** As a プレイヤー, I want 攻撃や建設時にエフェクトが表示される, so that ゲームの視覚的フィードバックが得られる

#### Acceptance Criteria
1. When タワーが発射した時, the Game shall マズルフラッシュエフェクトを表示する
2. When 弾が敵に命中した時, the Game shall タワー種別に応じた着弾エフェクトを表示する
3. When 敵が撃破された時, the Game shall パーティクル爆発エフェクトを表示する
4. When タワーがアップグレードされた時, the Game shall アップグレードフラッシュとリング波エフェクトを表示する

### Requirement 14: UI・HUD

**Objective:** As a プレイヤー, I want ゲーム状態と操作パネルが分かりやすく表示される, so that 必要な情報にすぐアクセスできる

#### Acceptance Criteria
1. The Game shall ベースHP、リソース残高、現在ウェーブ数、残敵数をHUDに常時表示する
2. The Game shall Preact Signalsでゲーム状態値をHUD DOM要素に自動バインドする
3. When ノードまたはエッジを選択した時, the Game shall 詳細パネル（ステータス、レベル、操作ボタン）を表示する
4. The Game shall タワー種別選択ツールバーを提供する
5. The Game shall メインメニュー、ゲームオーバー、ゲームクリアのオーバーレイ画面を提供する
6. The Game shall シミュレーション速度変更ボタン（一時停止、1×、2×、4×）を提供する

### Requirement 15: スコアリング

**Objective:** As a プレイヤー, I want ゲーム終了時にスコアが表示される, so that プレイの結果を数値で確認できる

#### Acceptance Criteria
1. When ゲームクリアまたはゲームオーバーになった時, the Game shall 最終スコアを計算し表示する
2. The Game shall スコア算出にウェーブ到達数、残りベースHP、残りリソース、経過時間を加味する
3. The Game shall スコア算出ロジックをGame層の純粋関数として実装する
4. The Game shall ウェーブ数と経過時間からスコアの理論上限を算出し、妥当性チェックに使用できるようにする

### Requirement 16: デプロイ

**Objective:** As a 開発者, I want GitHub Pagesにデプロイできる, so that ブラウザからゲームにアクセスできる

#### Acceptance Criteria
1. The Game shall `npm run build` の出力がGitHub Pagesで動作する静的ファイル一式となる
2. The Game shall ベースパス設定によりリポジトリ名サブディレクトリでも動作する
3. The Game shall 本番ビルドでminify + terserによるコード難読化を適用する
