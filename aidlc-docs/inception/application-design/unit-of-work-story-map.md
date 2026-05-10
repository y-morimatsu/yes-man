# Unit of Work Story Map - YesMan ストーリー × ユニット

**プロジェクト**: YesMan
**作成日**: 2026-05-09

**34 ストーリー (元 25 + Journey G 7 + Journey B B7・B8 2)** を **12 ユニット (元 11 + U-Persona)** にマッピング。**すべての Story が少なくとも 1 ユニットに紐付くこと** を保証する。

ユニット定義は [unit-of-work.md](unit-of-work.md)、依存関係は [unit-of-work-dependency.md](unit-of-work-dependency.md) を参照。

---

## 1. マッピング表

| Story | タイトル | Journey | 主担当ユニット (◎) | 関連ユニット (○) |
|---|---|---|---|---|
| **A1** | 起動時の趣旨説明と免責表示 | A | **U7a / web-shell** ◎、**U7d / features (onboarding)** ◎ | U7b (UI 部品) |
| **A2** | サインアップ | A | **U3 / auth** ◎、**U7d / features (auth)** ◎ | U1 (Cognito), U7a (ガード), U7c (型) |
| **A3** | プロフィール初期入力 | A | **U3 / auth** ◎、**U7d / features (auth)** ◎ | U2 (永続化), U7c (型) |
| **A4** | 初回提案体験 | A | **U7d / features (decision)** ◎ | U4 (Decision API), U7c (型) |
| **B1** | テキスト入力で決定を依頼 | B | **U4 / decision** ◎、**U7d / features (decision)** ◎ | U7c (型) |
| **B2** | 音声入力で決定を依頼 | B | **U6 / voice** ◎、**U7d / features (decision)** ◎ | U4 (Decision 連携), U7b (マイク UI), U7c (型) |
| **B3** | 合議による提案生成 | B | **U4 / decision** ◎ | U2 (Decision Repo), U7c (型) |
| **B4** | スワイプで Yes/No を選択 | B | **U7a / web-shell** ◎ (スワイプ判定基盤)、**U7d / features (decision)** ◎ | U7b (スワイプ UI 部品), U-Test (PBT 対象) |
| **B5** | 決定結果の永続化 | B | **U2 / storage** ◎ | U4 (呼び出し元), U-Test (PBT roundtrip) |
| **B6** | 主体性スコアの更新と表示 | B | **U4 / decision (AutonomyScorer)** ◎、**U7d / features (score)** ◎ | U2 (履歴 Repo), U7c (型), U-Test (PBT 不変条件) |
| **B7** | 合議リアルタイム表示 (SSE) | B | **U4 / decision (DiscussionStreamer + ConsensusOrchestrator.parse_streaming_chunk + LLMProviderAdapter.complete_stream)** ◎、**U7d / features (LiveDiscussionView)** ◎ | U2 (decisions.persona_outputs 永続化), U7b (人格別アバター UI), U7c (SSE クライアント型 / EventSource 抽象), U1 (ALB アイドルタイムアウト調整) |
| **B8** | 議論履歴ビュー | B | **U4 / decision (DiscussionStreamer.get_discussion_transcript)** ◎、**U7d / features (DiscussionHistoryView)** ◎ | U2 (decisions.persona_outputs 読込), U7b (オーバーレイ UI), U7c (型 / エクスポート連携) |
| **C1** | No で合議による別案再生成 | C | **U4 / decision** ◎ | U2 (履歴更新), U7d (UX 表示) |
| **C2** | No 連続時の AI 生成可変メッセージ | C | **U4 / decision (NudgeMessageGenerator)** ◎、**U7d / features (decision)** ◎ | U7c (型) |
| **C3** | 再考マイクロコピーの段階的強化 | C | **U4 / decision (NudgeMessageGenerator)** ◎、**U7d / features (decision)** ◎ | U7c (型) |
| **C4** | 最終的に Yes に至る肯定演出 | C | **U7d / features (decision)** ◎ | U7b (アニメーション), U2 (履歴更新) |
| **D1** | 沈黙演出ドメインで AI が沈黙 | D | **U4 / decision (SilenceGuard)** ◎ | U1 (Bedrock Guardrails), U2 (silence_logs) |
| **D2** | 沈黙レスポンスの視覚的演出 | D | **U7a / web-shell** ◎、**U7d / features (decision)** ◎ | U7b (沈黙演出 UI) |
| **E1** | 過去履歴から嗜好プロファイル蓄積 | E | **U5 / learning** ◎ | U2 (PreferenceProfile Repo), U1 (EventBridge) |
| **E2** | 嗜好に沿った提案生成 | E | **U5 / learning** ◎、**U4 / decision** ◎ (プロンプト注入) | — |
| **E3** | 嗜好プロファイルの閲覧 | E | **U5 / learning** ◎、**U7d / features (preferences)** ◎ | U2 (Repo), U7c (型) |
| **E4** | 嗜好プロファイルの修正・リセット | E | **U5 / learning** ◎、**U7d / features (preferences)** ◎ | U2 (Repo) |
| **E5** | コールドスタート時の初期推定 | E | **U5 / learning** ◎ | U3 (Profile を context に) |
| **F1** | 認証バックエンドの設定切替 | F | **U1 / infra** ◎ (Cognito stack)、**U3 / auth** ◎ (AuthAdapter Strategy + DI) | U-Test (切替確認) |
| **F2** | 永続化バックエンドの設定切替 | F | **U1 / infra** ◎ (Aurora stack)、**U2 / storage** ◎ (Repository Strategy + DI) | U-Test |
| **F3** | LLM プロバイダーの設定切替 | F | **U1 / infra** ◎ (Secrets / Bedrock IAM)、**U4 / decision** ◎ (LLMProviderAdapter Strategy + DI、LiteLLM) | U-Test |
| **F4** | 音声バックエンドの設定切替 | F | **U1 / infra** ◎ (Polly/Transcribe IAM)、**U6 / voice** ◎ (VoiceAdapter Strategy + DI) | U-Test |
| **G1** | ペルソナ作成 | G | **U-Persona / persona** ◎ (CRUD + PersonaModerator) | U2 (Repo), U7d (UI) |
| **G2** | ペルソナ編集・削除 | G | **U-Persona / persona** ◎ | U2, U7d |
| **G3** | ペルソナ共有公開 | G | **U-Persona / persona** ◎ (is_shared フラグ + オプトイン) | U2, U7d |
| **G4** | 共有プール閲覧・選択 | G | **U-Persona / persona** ◎、**U7d / features** ◎ (共有プール画面) | U7c (型) |
| **G5** | 合議でペルソナ選択 | G | **U-Persona / persona** ◎ (UserPersonaSelection)、**U4 / decision** ○ (合議組込み)、**U7d / features** ◎ (選択ドロワー) | U2 |
| **G6** | 悪用報告 | G | **U-Persona / persona** ◎ (PersonaModerator.report + PersonaReportRepository) | U7d (報告 UI) |
| **G7** | 沈黙ドメイン誘発除外 | G | **U-Persona / persona** ◎ (filter_at_consensus)、**U4 / decision** ◎ (合議実行時の連動) | U-Test |

---

## 2. ユニット別ストーリー数

| ユニット | 主担当ストーリー数 (◎) | 関連 (○) |
|---|---:|---:|
| **U1 / infra** | 4 (F1〜F4) | 7 (D1, A2, B5, B7 (ALB アイドルタイムアウト) 系の支援) |
| **U2 / storage** | 4 (B5, F2 + E1/E3/E4 の Repo) | 多数 (B7・B8 の persona_outputs 読み書きを含む) |
| **U3 / auth** | 3 (A2, A3, F1) | 多数 |
| **U4 / decision** | 12 (B1, B3, B6, B7, B8, C1, C2, C3, D1, E2, F3 + Score 計算) | 多数 |
| **U5 / learning** | 5 (E1, E2, E3, E4, E5) | — |
| **U6 / voice** | 2 (B2, F4) | — |
| **U7a / web-shell** | 4 (A1, B4, D2, ガード機能) | 多数 |
| **U7b / ui** | 0 直接 (UI 部品提供のみ) | 全 UX ストーリー (LiveDiscussion・DiscussionHistory アバター/オーバーレイを含む) |
| **U7c / api-client** | 0 直接 (型/通信提供のみ) | 全 API 連携 (SSE EventSource 抽象を含む) |
| **U7d / features** | 14 (A1, A2, A3, A4, B1, B2, B4, B6, B7, B8, C2, C3, C4, D2, E3, E4) | — |
| **U-Test** | 0 直接 (受け入れ基準横断) | 全ストーリーの AC 検証 (B7 の SSE / 切断復元、B8 の権限チェックを含む) |

---

## 3. カバレッジ検証

✅ **全 34 ストーリーが少なくとも 1 つの主担当ユニット (◎) に紐付いていることを確認**

| Journey | カバレッジ |
|---|:---:|
| A (4 stories) | A1 / A2 / A3 / A4 ✅ |
| B (8 stories) | B1 / B2 / B3 / B4 / B5 / B6 / B7 / B8 ✅ |
| C (4 stories) | C1 / C2 / C3 / C4 ✅ |
| D (2 stories) | D1 / D2 ✅ |
| E (5 stories) | E1 / E2 / E3 / E4 / E5 ✅ |
| F (4 stories) | F1 / F2 / F3 / F4 ✅ |
| G (7 stories) | G1 / G2 / G3 / G4 / G5 / G6 / G7 ✅ |

合計: **34 / 34 ストーリーがマッピング済み** (元 25 + Journey G 7 + Journey B B7・B8 2)

---

## 4. ペルソナ × ストーリー × ユニット のクロスリファレンス

ペルソナとストーリーのマッピングは [user-stories/stories.md](../user-stories/stories.md) と [user-stories/diagrams/persona-story-map.drawio](../user-stories/diagrams/persona-story-map.drawio) を参照。

ペルソナ → ユニット への影響例:
- **田中（メイン）**: 全主担当ユニットがすべて関連
- **佐藤（ガイダンス受容）**: 特に **U4 (NudgeMessageGenerator)** と **U7d (decision feature)** が強く影響
- **山田（対比）**: 主体性スコアが高くなる行動パターンを **U-Test** で観察対象テストとして含む
- **YesMan 開発メンバー**: **U1 / U2 / U3 / U4 / U6** の Strategy + DI 切替が直接の体験 (Journey F)

---

## 5. ユニット境界とストーリーの一貫性チェック

| チェック | 結果 |
|---|---|
| すべての Story が主担当ユニットを持つ | ✅ |
| 同一 Journey 内のストーリーが過剰に分散していない | ✅ (Journey C は U4 + U7d に集中、Journey E は U5 + U7d に集中) |
| 横断的関心事 (Journey F) が「主担当 + 横串」として明示されている | ✅ (F1〜F4 は U1 + 該当モジュールの組合せ) |
| Frontend 細分化 (U7a/U7b/U7c/U7d) が全フロント Story をカバー | ✅ |
| U-Test がすべてのユニットに対して横串で接続される | ✅ (依存マトリクス参照) |
| ユニット間の循環依存がない | ✅ ([unit-of-work-dependency.md](unit-of-work-dependency.md) 参照) |

---

## 6. Construction Phase への引き継ぎ

各ユニットは Construction Phase で **per-unit ループ** に入る。順序は依存マトリクスとクリティカルパスに従う:

```
[Phase 0] U1 / infra
[Phase 1] U2 / storage   |  U7b / ui  |  U7c / api-client (スタブ)  |  U-Test (基盤)
[Phase 2] U3 / auth      |  U4 / decision  |  U6 / voice
[Phase 3] U5 / learning
[Phase 4] U7a / web-shell  |  U7d / features
[Phase 5] U-Test (E2E + PBT 本格化)
[Phase 6] Build and Test (全ユニット統合)
```

各 Phase 内のユニットは独立して per-unit ループ (Functional Design → NFR Requirements → NFR Design → Infrastructure Design → Code Generation) を回す。
