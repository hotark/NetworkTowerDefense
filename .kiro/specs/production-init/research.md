# Research & Design Decisions

## Summary
- **Feature**: `production-init`
- **Discovery Scope**: New Feature（greenfield）
- **Key Findings**:
  - mockup/part003の1181行main.jsをCore/Game/Browserの3層に分解することで保守性が大幅に改善される
  - Map<ID, Entity>パターンにより、mockupで発生したインデックスずれバグ（remapPacketsAfterEdgeRemoval）を根本的に排除できる
  - Preact Signals（~2KB）はReactivePropertyパターンとしてUI層に最適。ゲームループ内Canvas描画には使用しない

## Research Log

### 3層アーキテクチャ分割
- **Context**: mockup/part003のmain.jsが1181行に肥大化。入力処理・ゲームロジック・UI更新が混在
- **Sources Consulted**: mockup/part003/js/*.js全ファイル分析
- **Findings**:
  - main.js内のupdate()は10ステップに分かれており、各ステップは独立した関数に分離可能
  - renderer.jsは既に892行の純粋な描画関数群で、Game層にそのまま移植可能
  - config.jsは319行の純粋データで、Core層にそのまま移植可能
  - graph.js, packet.js, enemy.js, bullet.jsは各々独立したモジュールで分離済み
- **Implications**: mockupのモジュール構造は良好。型付けと層分離を加えるだけで本番品質になる

### 状態管理: 配列インデックス vs Map<ID, Entity>
- **Context**: mockupではpacket.edgeIndexで配列インデックス参照→エッジ削除時にremapが必要だった
- **Findings**:
  - 配列: イテレーション高速、だが削除時にO(n)リマッピング必要
  - Map: 削除がO(1)、参照も安全、だがイテレーション時にスプレッドが必要
  - このゲームの規模（ノード~30、エッジ~50、パケット~100、敵~50）ではMap性能差は無視可能
- **Implications**: Map<ID, Entity>を採用。安全性 > 性能（性能差は計測不可能レベル）

### Preact Signals vs 自作ReactiveProperty
- **Context**: UIリアクティブ層の選定
- **Findings**:
  - Preact Signals core: ~2KB、signal/effect/computed提供、TypeScript完全対応
  - 自作: ~20行で実装可能だがcomputed/batch/dispose等が手動
  - Preact Signalsはゲームループ外でのみ使用（Canvas描画は毎フレーム手動）
- **Implications**: Preact Signals採用。computed()でHP割合計算等が宣言的に書ける

### 固定タイムステップゲームループ
- **Context**: デバイス間の物理更新一貫性
- **Findings**:
  - 1/60秒の固定dt + accumulator方式が定番
  - dtクランプ（100ms上限）でスパイラル・オブ・デス防止
  - requestAnimationFrameベースで描画は可変フレームレート
- **Implications**: mockupの可変dtから固定タイムステップに変更

### Pointer Events API
- **Context**: マウス＋タッチの統合入力
- **Findings**:
  - Pointer Events: すべてのモダンブラウザでサポート（caniuse 97%+）
  - pointerId でマルチタッチを個別追跡
  - 2ポインタ間距離でピンチ検出、中心移動でパン検出
  - CSS touch-action: noneでブラウザデフォルトジェスチャー無効化
- **Implications**: TouchEventsとMouseEventsの両方をカバーする単一API

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 3層オニオン | Core/Game/Browser依存方向固定 | 明確な依存ルール、テスト容易 | 層間通信がやや冗長 | 選択。steering準拠 |
| フラット関数型 | 全モジュールがフラットに並ぶ | シンプル、mockupに近い | 依存が無秩序に | 却下。規模に不適 |
| ECS | Entity-Component-System | 高い拡張性 | この規模ではオーバーエンジニアリング | 却下。議論済み |

## Design Decisions

### Decision: エンティティID体系
- **Context**: 複数種類のエンティティIDが混在するため型安全が必要
- **Alternatives Considered**:
  1. 単純なstring — 型的に区別不能
  2. ブランド型（`string & { __brand: 'NodeId' }`）— コンパイル時に区別
  3. クラスラッパー — ランタイムオーバーヘッド
- **Selected Approach**: ブランド型
- **Rationale**: ゼロコストで型安全。NodeIdとEdgeIdを混同するバグを防止
- **Trade-offs**: 生成時にas assertionが必要

### Decision: Canvas描画とカメラ変換
- **Context**: 全描画にカメラ変換を適用する方法
- **Alternatives Considered**:
  1. 描画関数内で毎回座標変換 — 煩雑
  2. ctx.setTransform()でカメラ行列を適用 — 一括
- **Selected Approach**: ctx.setTransform()方式
- **Rationale**: 描画前にカメラ行列を設定し、全描画がワールド座標で描ける。UI要素のみidentity行列に戻す

## Risks & Mitigations
- **mockup移植の抜け漏れ** — 要件をmockup機能と照合し、差分リストを作成して追跡
- **モバイル性能** — 固定タイムステップでロジック負荷を制御。描画はフレームスキップ可能に
- **Preact Signals依存** — core層には入れない。Browser層のみで使用し、将来の差し替えを容易に

## References
- [Pointer Events - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) — 入力統合API
- [Preact Signals](https://preactjs.com/guide/v10/signals/) — UIリアクティブライブラリ
- [Fix Your Timestep - Gaffer On Games](https://gafferongames.com/post/fix_your_timestep/) — 固定タイムステップの定番記事
