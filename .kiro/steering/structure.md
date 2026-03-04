# Project Structure

## 組織哲学

**3層レイヤードアーキテクチャ** + **機能別モジュール分割**

依存は常に内側へ。各層はそれより内側の層だけをimportできる。

## ディレクトリパターン

### Core層 (`src/core/`)
**目的**: ゲームエンジンもブラウザも知らない純粋な基盤
**含まれるもの**: 型定義、設定データ、Camera、InputManager
**ルール**: 外部ライブラリ・DOM・Canvas APIに依存しない（Preact Signalsも不可）

### Game層 (`src/game/`)
**目的**: ゲーム固有のロジックと描画
**含まれるもの**: network, combat, wave, economy, renderer
**ルール**: Core層のみimport可。DOM操作禁止。Canvas APIはrenderer.tsのみ

### Browser層 (`src/browser/`)
**目的**: ブラウザ固有の統合（Presenter）
**含まれるもの**: ゲームループ統合、HUD UIバインド
**ルール**: Core + Game をimportし、繋ぎ合わせる唯一の層

### エントリポイント (`src/main.ts`)
**目的**: bootstrap（DOM取得、Game生成、起動）

## 命名規則

- **ファイル**: kebab-case (`game-app.ts`, `config.ts`)
- **型/インターフェース**: PascalCase (`GameState`, `TowerNode`, `EdgeEntity`)
- **関数**: camelCase (`updatePackets`, `createBullet`)
- **定数**: SCREAMING_SNAKE_CASE (`FIXED_DT`, `TOWER_LEVELS`)
- **ID型**: ブランド型 (`type NodeId = string & { __brand: 'NodeId' }`)

## Import規則

```typescript
// 同じ層内: 相対パス
import { Camera } from './camera'

// 内側の層: エイリアスパス
import { GameState } from '@core/state'
import { updatePackets } from '@game/network'

// 外側の層: ❌ 禁止（Core/GameからBrowserをimportしない）
```

**パスエイリアス**:
- `@core/` → `src/core/`
- `@game/` → `src/game/`
- `@browser/` → `src/browser/`

## コード組織原則

### エンティティはMap<ID, Entity>
配列インデックスで他エンティティを参照しない。ID文字列で参照する。

### 関数は純粋に近く
ゲームロジック関数は `(state, dt) => void` の形。
stateを直接変更するが、DOM/Canvas/外部リソースには触らない。

### 設定はデータとして分離
バランスパラメータ（タワーステータス、エッジレベル、ウェーブ定義）は
`config.ts` に集約。ロジックコード内にマジックナンバーを書かない。

## ゲーム機能の配置マップ

各機能がどの層に属するかの指針:

| 機能 | 層 | 配置先 | 備考 |
|------|-----|--------|------|
| **バランス設定** | Core | `core/config.ts` | タワーLv別ステータス、エッジLv、コスト表 |
| **ウェーブ定義** | Core | `core/waves.ts` | 30ウェーブの敵構成・タイミング |
| **エフェクト定義** | Core | `core/effects.ts` | エフェクト種別・パラメータ（データのみ） |
| **エフェクト描画** | Game | `game/renderer.ts` | Canvas上のパーティクル・フラッシュ描画 |
| **SE/BGM** | Game | `game/audio.ts` | 再生ロジック（トリガー条件、音量、フェード） |
| **SE/BGMアセット** | — | `src/assets/audio/` | Viteアセットパイプラインで管理 |
| **ランキング** | Browser | `browser/ranking.ts` | Firebase等の外部BaaS連携、オンラインランキング |
| **UI機構** | Browser | `browser/hud.ts` | HUD、メニュー、オーバーレイ、Signals連携 |
| **UI部品** | Browser | `browser/ui/` | ボタン、パネル、モーダル等の再利用部品 |

### 判断基準

- **データ定義**（数値テーブル、型、パラメータ）→ Core
- **ゲーム内ロジック**（判定、計算、再生トリガー）→ Game
- **ブラウザAPI依存**（DOM、localStorage、Audio API実体）→ Browser

### アセット

- SVGスプライト: `src/assets/towers/`, `src/assets/enemies/`
- SE/BGM: `src/assets/audio/`
- Viteのアセットパイプラインで管理（import文で参照）

## チート対策（静的ページ前提）

クライアント完結の静的ページなので、完全なチート防止は不可能。
ランキング送信時の妥当性検証に重点を置く。

### 方針

| 対策 | 層 | 内容 |
|------|-----|------|
| **スコア妥当性チェック** | Game | ウェーブ数・経過時間から理論上限を算出し、超過スコアを弾く |
| **リプレイデータ送信** | Browser | ゲーム操作ログをスコアと共にFirebaseに送信。サーバー側で再検証可能に |
| **Firebase Security Rules** | 外部 | 送信レートの制限、スキーマ検証、匿名認証の必須化 |
| **コード難読化** | ビルド | Vite本番ビルドでminify + terser。抑止効果のみ |
| **整合性ハッシュ** | Game | ゲーム状態の要所にチェックポイントを設け、改ざん検知用ハッシュを生成 |

### 割り切り
- DevToolsでの変数書き換えは完全には防げない
- リプレイ検証は「疑わしいスコアの事後調査」に使う運用
- カジュアルチートの抑止が目的。プロ級の解析には対応しない

---
_パターンを記述。ファイルツリーではない。パターンに従う新規ファイルはここの更新不要_
