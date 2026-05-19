# Units Generation - クラリフィケーション質問

回答ありがとうございます。**Q2 で「U7 Frontend PWA を細分化する」** とあったため、細分化の方針だけ確認させてください。

---

> **📌 Post-Approval Update Notice (2026-05-10 整合化)**
>
> 本ファイルは Q&A snapshot として作成時点 (2026-05-09) の議論内容を保持する **歴史的記録**です。
> その後 INCEPTION 完了前に「本気のサービス」方針整合化 (2026-05-10) が行われ、本ファイル内に残る「罪悪感」「ナッジ受容」「ダークパターン」「アート/風刺」「何も実現しないことを実現する」等の satire 用語は、**最新の正規ドキュメント** ([requirements.md](../requirements/requirements.md) / [personas.md](../user-stories/personas.md) / [stories.md](../user-stories/stories.md) など) では「再考」「ガイダンス受容」「断定調 UX」「意思決定支援サービス」等の中立的表現に置換されています。
> 本ファイルの記述は当時の Q&A 議論の文脈で読み取ってください。最新の正規仕様は前述リンクを参照してください。

---


## ⚠️ 確認 1: U7 Frontend PWA の細分化方針

Frontend を細分化する方法はいくつかあります。下記から選択してください（複数の場合は Other で組合せ指定可）。

### Clarification Question 1
Frontend の細分化方針は？

A) **機能 (フィーチャー) で細分化**
```
U7  → 廃止
U7a Web Shell    (ルーティング + 認証 + レイアウト)
U7b Auth UI      (Cognito Hosted UI 連携)
U7c Decision UI  (テキスト/音声入力 + スワイプ Yes/No + 提案表示)
U7d Score UI     (主体性スコア・ダッシュボード)
U7e Preferences UI (嗜好プロファイル閲覧・修正)
U7f Onboarding UI (起動時免責 + 初回フロー)
```

B) **責務レイヤーで細分化**
```
U7  → 廃止
U7a UI Components Library (`packages/ui/`、共有 UI 部品)
U7b Web App (`apps/web/`、画面・フロー)
U7c API Client (`packages/api-client/`、OpenAPI 自動生成 TS クライアント)
```

C) **ジャーニー単位で細分化** (Journey A〜E と整合)
```
U7  → 廃止
U7a Journey A: Onboarding View
U7b Journey B+C: Decision Loop View
U7c Journey D: Silence View
U7d Journey E: Learning Dashboard View
U7e Web Shell (共通レイアウト・ルーティング)
```

D) **A + B のハイブリッド** (最も実用的): Web Shell + UI Library + 機能別画面群
```
U7  → 廃止
U7a Web Shell      (`apps/web/`、ルーティング・認証ガード・レイアウト)
U7b UI Library     (`packages/ui/`、共有 UI 部品 + デザイントークン)
U7c API Client     (`packages/api-client/`、OpenAPI 自動生成)
U7d Feature Views  (apps/web 内の features/auth, features/decision, features/score, features/preferences, features/onboarding をフロント担当が並列開発)
```

X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## 完了したら

`[Answer]:` を埋めたら「**完了**」「**done**」と教えてください。回答を踏まえて Unit of Work 成果物を生成します。

---

## ℹ️ 補足: その他の前提（仮定で進めます）

以下は **回答内容で問題なし**と判断し、追加質問なしで Part 2 に進みます：

- **Q9 = B (独立テストユニット U-Test)**: E2E (Playwright) + PBT (Hypothesis 等) を集約する横断ユニットとして扱います。各ユニット内の単体テストは含みません。
- **Q6 = C (役割分担)**: フロント担当 / バック担当 / インフラ担当を主担当として割当て、必要に応じて越境可能とします（PR レビューで品質担保）。
- **Q1 = A (モジュラー・モノリス) + Q8 = A (同コンテナ Worker)**: API は単一 ECS Service / 単一 FastAPI コンテナでデプロイ、内部に DDD 形式 (Q4=A) のモジュール (auth/decision/learning/voice/storage/internal-events) を配置します。
- **Q7 = A (Journey F 解消)**: 設定切替は U1 (Infrastructure)・U-API 内のモジュール (各 Adapter) に分散して反映します。

---

## Post-CONSTRUCTION 改修注記 (2026-05-19) — Historical Artifact

本ファイルは 2026-05-10 当時の Unit of Work 段階で発生した user-AI clarification 対話の **Snapshot (immutable historical artifact)** であり、Post-CONSTRUCTION で modify しない。

Post-CONSTRUCTION 段階の clarification は CLAUDE.md `Git-Flow Branching Model` 「Hackathon Pragmatism」緩和ルールに従い、直接コミットメッセージ + audit.md 末尾追記で記録。
