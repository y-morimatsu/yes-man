# YesMan v0.4.0 — ツアーデモ動画

スマホ画面サイズ (393×851、Pixel 5 / iPhone 12-15 系) で全機能を Playwright で自動録画するキットです。

## 出力 (Latest)

`docs/demo/output/YesMan-tour-<timestamp>.{webm,mp4,gif}` に書き出されます。

- **webm**: Playwright の生出力 (VP9、~3MB)
- **mp4**: H.264 + AAC + `+faststart` (Web/Twitter/X 埋め込み用、~1MB)
- **gif**: 12 fps + palettegen (Slack/Discord 用、~10MB)

最新の動画は `git ls-files -- 'docs/demo/output/*'` で確認できます (LFS なしの直 commit のため、binary 容量に注意)。

## 録画手順

### 1. 前提: dev server を起動

```bash
# api (default の AUTH_BACKEND=mock + MOCK_AUTO_USER=true で OK)
pnpm --filter @yesman/api run start:dev
# web (default の VITE_AUTH_BYPASS=true で OK)
pnpm --filter @yesman/web run dev
```

`http://localhost:8000/health` と `http://localhost:5173/` がそれぞれ 200 を返すことを確認。

### 2. Playwright で録画

```bash
cd tests/e2e
node scripts/record-tour.mjs
```

- 所要時間: ~2-3 分 (Azure GPT 等の実 LLM 経由の場合)
- 出力: `docs/demo/output/page@<hash>.webm`
- mobile viewport: 393×851 (Pixel 5)、locale `ja-JP`、timezone `Asia/Tokyo`
- 全 7 section をシーケンシャルに走査

### 3. mp4 + GIF に変換

```bash
bash docs/demo/scripts/convert.sh
```

- 引数省略時は `output/` 内の最新 `page*.webm` を自動選択
- 入力 webm を `YesMan-tour-<timestamp>.webm` に rename
- mp4 (H.264 + AAC、`+faststart` で Web streaming 対応)
- gif (12 fps + palettegen for 高品質 256 色)

## カバレッジ (~130s)

| Section | 時間 | 内容 |
|---|---|---|
| §1 | ~4s | **Splash** (逆説的設計の明示 + CTA) |
| §2 | ~8s | **Sign-in** (Email + 表示名 入力 → サインイン、Mock auth) |
| §3 | ~6s | **Home メニュー** (📊 最近の YesMan サマリカード + 💭 合議で決定 + その他カード) |
| §4 | ~28s | **Decision (1 回目)**: QuickStart → 合議 streaming (3 persona pre-fill + **typing dots ●●●** + bubble token streaming + 「📨 合議完了」 notification) |
| §5 | ~5s | **1 回目 Yes 採択** → confetti + マスコット 🤵「やった!」 |
| §6 | ~20s | **2 回目合議 → Yes → combo 🔥** 2 連目 + tier 強化 confetti |
| §7 | ~8s | `/score` **委任度スコア** + 円グラフ + 30 日推移 + **最近の Yes 採択履歴** (scroll で見せる) |
| §8 | ~6s | `/preference` **嗜好プロファイル** (採択/棄却傾向 + ペルソナ嗜好) |
| §9 | ~6s | `/profile` **プロフィール** (表示名 / 音声 backend 設定 / 二段階削除) |
| §10 | ~5s | `/personas/selection` **ペルソナ選択** (3 builtin + 共有プール) |

## 演出ハイライト

- ☑️ **chat 風 typing dots** (●●● blink in bubble)
- ☑️ **bubble slide-in** + persona pre-fill (`personas` SSE event)
- ☑️ **YesMan マスコット** 🤵 右上 fixed + 状況別 speech bubble (5 状態)
- ☑️ **コンボシステム** (`useYesCombo` localStorage 日次 reset、tier 🔥/🌟/⚡/🏆)
- ☑️ **tier 別 confetti** (10 連で 3 wave 大爆発 + 金色 — 本ツアーでは未到達)
- ☑️ **swipe card 右辺 green グロー** + 「→ → → Yes」 marching arrows
- ☑️ **proposal 到着 notification banner** (📨 合議が完了しました、2.4s)
- ☑️ **LLM 動的 Yes nudge microcopy** (本ツアーでは No を採択しないため未表示、別バリエーション動画で必要)

## カスタマイズ

### 別 base URL を指定

```bash
DEMO_BASE_URL=https://yesman.example.com node tests/e2e/scripts/record-tour.mjs
```

### 異なるシナリオ

`tests/e2e/scripts/record-tour.mjs` を編集 (各 section の `await page.click(...)` + `await pause(...)` を調整):

- **エレベーター版** (~30s): §2 と §3 だけにし他を comment out
- **No 連打 nudge 版**: §3 で `Yes` ボタンを `No` ボタンに変更、`NoMicroCopyBanner.dynamicMessage` (LLM 生成) を表示
- **10 連 combo 達成版**: §4 のループを 10 回繰り返し、最終 `🏆 10 連 Yes` + 3 wave 大爆発を見せる

## トラブルシュート

| 症状 | 対応 |
|---|---|
| `proposal notification not seen in time` | LLM が遅い (Azure / opencode 等)、`await pause(8000)` を 12000 に増やす。あるいは `LLM_PROVIDER=mock` + `MOCK_LLM_PERSONA_DELAY_SECONDS=0.5` で安定化 |
| `Yes ボタンが見つからない` | QuickStart の表示条件 (`VITE_QUICKSTART_DEDUPE=off` + localStorage clear) を確認、script は `seedAuth` で clear している |
| `Cannot find package '@playwright/test'` | script は `tests/e2e/scripts/` 配下である必要あり (root `node_modules` に @playwright/test はない) |

## デプロイ動画として埋め込む

- **GitHub Releases**: `gh release create v0.4.0 ./docs/demo/output/YesMan-tour-*.mp4 --notes-file release-notes.md`
- **X (Twitter)**: mp4 を直接 upload (<140s、<512MB 制限内)
- **Slack/Discord**: gif を直接貼り付け
- **README.md**: `![Demo](docs/demo/output/YesMan-tour-<timestamp>.gif)` で埋め込み (size 注意)
