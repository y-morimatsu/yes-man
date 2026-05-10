# User Stories 生成計画 / Story Generation Plan

**プロジェクト**: YesMan
**作成日**: 2026-05-09
**Phase**: User Stories - Part 1: Planning

> **📌 Post-Approval Update Notice (2026-05-09T05:15:00Z)**
>
> 本計画書は User Stories Part 1 の Q&A スナップショットです。承認後、要求仕様 FR-PERSONA (3.11) の追加に伴い、Journey が **6 → 7 (Journey G 追加)**、ストーリーが **25 → 32** に増加しました。最新内容は [stories.md](../user-stories/stories.md) を参照してください。本ファイルは Q&A の歴史的記録として保持されます。


> **📌 Post-Approval Update Notice (2026-05-10 整合化)**
>
> 本ファイルは Q&A snapshot として作成時点 (2026-05-09) の議論内容を保持する **歴史的記録**です。
> その後 INCEPTION 完了前に「本気のサービス」方針整合化 (2026-05-10) が行われ、本ファイル内に残る「罪悪感」「ナッジ受容」「ダークパターン」「アート/風刺」「何も実現しないことを実現する」等の satire 用語は、**最新の正規ドキュメント** ([requirements.md](../requirements/requirements.md) / [personas.md](../user-stories/personas.md) / [stories.md](../user-stories/stories.md) など) では「再考」「ガイダンス受容」「断定調 UX」「意思決定支援サービス」等の中立的表現に置換されています。
> 本ファイルの記述は当時の Q&A 議論の文脈で読み取ってください。最新の正規仕様は前述リンクを参照してください。

---

## 0. 前提

- Requirements Analysis (`aidlc-docs/inception/requirements/requirements.md`) 承認済
- 拡張機能: Security Baseline + Property-Based Testing 有効
- 想定ユーザー層: 審査員 / Z 世代 / AI 研究者・哲学好き

## 1. ストーリー作成方針への質問

以下に **`[Answer]:`** タグへ A/B/C... または自由記述で回答してください。

---

### Question 1: ストーリーフォーマット
ユーザーストーリーの記法はどれを採用しますか？

A) クラシック: 「**As a [persona], I want [goal], so that [benefit]**」+ AC を箇条書き
B) クラシック (A) + AC は **Gherkin (Given-When-Then)** で記述（PBT・E2E自動テストへ連携しやすい）
C) Job Stories: 「**When [situation], I want to [motivation], so I can [outcome]**」(動機ドリブン)
D) ハイブリッド: コアストーリーは A、複雑な体験フロー（合議・沈黙・ナッジ）は C を採用
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 2: ストーリーの分割アプローチ
ストーリーをどう構造化しますか？

A) **User Journey-Based** (起動→入力→提案→Yes/No→学習 のフローに沿う)
B) **Feature-Based** (認証 / AI合議 / 沈黙演出 / 学習 / スコア / 音声 / 履歴 で機能群に分ける)
C) **Persona-Based** (審査員ペルソナ / 一般ユーザー / 哲学好き で分ける)
D) **Epic-Based** ハイブリッド: Epic = 機能群、その下に Journey 別ストーリーをぶら下げる
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3: ストーリー粒度
1 ストーリーあたりのサイズ感は？

A) 細かい (1 ストーリー = 半日〜1日で実装、AC 2〜4 個)
B) 中程度 (1 ストーリー = 1〜2日、AC 3〜5 個)
C) 粗い (1 ストーリー = 機能丸ごと、AC 5 個以上)
D) ハイブリッド: コア体験は A、補助機能は B/C
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4: ペルソナの粒度・数
ペルソナは何種類作りますか？

A) 3 ペルソナ: 審査員 / 一般 Z・ミレニアル / AI 研究者・哲学好き (要件 Section 6 に整合)
B) 5 ペルソナ: 上記 + 罪悪感に弱い人 + ナッジを楽しむアート好き
C) 1 ペルソナ: 「決めることに疲れた現代人」に統合
D) ハイブリッド: 主要 3 ペルソナ + 1 つの「アンチペルソナ」 (このプロダクトを使うべきでない人)
X) Other (please describe after [Answer]: tag below)

[Answer]: 「決めることに疲れた現代人」,「罪悪感に弱い人」,「自分の意志を強く持っている人」

---

### Question 5: ペルソナの記述項目
各ペルソナにどんな項目を含めますか？(複数可、Otherで自由記述)

A) 最小: 名前 / 年齢 / 職業 / モチベーション / ペインポイント
B) 標準: A + 価値観 / 一日の流れ / テクノロジー習熟度 / プロダクトへの期待
C) 拡張: B + 具体的シナリオ / 引用 (ペルソナ・クォート) / 写真イメージ説明
D) 最小限 (A) + 「YesMan が刺さるトリガーシーン」のみ
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 6: 受け入れ基準 (AC) の詳細度
AC の書き方は？

A) **Gherkin (Given-When-Then)** で 1 AC = 1 シナリオ (PBT/自動テストに連携)
B) **箇条書きチェックリスト** (短く、レビュアー視点で確認しやすい)
C) **Gherkin + 補足チェックリスト** ハイブリッド
D) ストーリーごとに最適なものを選ぶ
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 7: カバーすべきユーザージャーニー (複数選択可)
特にストーリー化したいフローはどれ？

A) **オンボーディング**: 起動 → 趣旨説明 (免責) → サインアップ → プロフィール入力 → 初回提案
B) **コア決定ループ**: 入力 → 合議 → 提案 → スワイプ → 結果保存 → スコア更新
C) **No 連打体験**: 別案再生成 → 罪悪感マイクロコピー → AI の問い直し → 最終的に Yes
D) **沈黙演出**: 「宗教」「選挙」「暴力」「卑猥」を入力 → AI 沈黙 → 体験的衝撃
E) **学習効果体験**: 履歴蓄積 → 嗜好に沿った提案 → ユーザーが学習を体感
F) **設定切替**: 認証 / 永続化 / LLM / 音声バックエンドを開発時に切替
X) Other (please describe after [Answer]: tag below)  ← 複数選びたい場合は「A,B,C,D,E,F」と記入

[Answer]: A,B,C,D

---

### Question 8: ハッカソン審査員シナリオの優先度
「審査員 5 分デモ」を専用ストーリーとして特別扱いしますか？

A) 審査員ペルソナの専用ストーリー群 (5分シナリオを一本のEpicとして) を作る
B) 通常ストーリーに審査員観点の AC を組み込む (専用Epicは作らない)
C) 別途「デモ・スクリプト」をストーリーから派生させて文書化
D) A + C
X) Other (please describe after [Answer]: tag below)

[Answer]: しない。

---

### Question 9: ストーリー優先度・MoSCoW
ストーリーに優先度を付けますか？

A) MoSCoW (Must / Should / Could / Won't) を全ストーリーに付与
B) 優先度なし、すべて等価扱い (ハッカソン MVP として全部 Must)
C) 3 段階 (P0=デモ必須 / P1=完成度向上 / P2=後続イテレーション)
D) MoSCoW + 各ストーリーに依存関係 (depends-on) 注釈
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 10: ストーリーへの要件トレーサビリティ
要件 ID (FR-* / NFR-*) との紐付けは？

A) 各ストーリーに「**Traces:** FR-AI-07, NFR-SEC-01」のように要件 ID 列を持たせる
B) ストーリーには付けず、別途トレーサビリティマトリクスを作成
C) Epic レベルでのみ要件 ID と紐付け
D) 紐付け不要 (Construction で別途整理)
X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

### Question 11: アンチペルソナ / 倫理的境界の表現
プロダクト的に避けたいユーザー（沈黙演出ドメインで本気の助言を求めて来る人など）への対応をストーリーに含めますか？

A) **アンチペルソナ**として 1 つ立て、「沈黙される側」の体験をネガティブストーリーで明文化
B) 通常のストーリー内で「該当する入力時は AI が応答しない」AC で済ませる
C) 倫理境界は別途 RFC / 設計ドキュメントで扱い、ストーリーには含めない
D) A + B (アンチペルソナを立てつつ、各機能ストーリーにもガード AC を入れる)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 12: 開発チーム視点のストーリー
開発者向けストーリー（「開発者として、Cognito を MOCK に切り替えてローカル開発したい」など）を含めますか？

A) 含める: FR-AUTH-05/06/07, FR-HIST-04/05/06 を「開発者ペルソナ」のストーリーで表現
B) 含めない: ユーザー視点のみに絞り、開発体験は技術タスクとして別管理
C) 部分的に含める: 開発切替系のみ最小限のストーリー化
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 2. 確定した方針 (回答 + クラリフィケーション統合)

| 観点 | 決定内容 |
|---|---|
| **フォーマット (Q1)** | Classic「As a..., I want..., so that...」+ AC は **Gherkin (Given-When-Then)** |
| **分割アプローチ (Q2)** | **User Journey-Based** |
| **ストーリー粒度 (Q3)** | 細かい (1 ストーリー = 半日〜1日、AC 2〜4 個) |
| **ペルソナ (Q4 + CQ2)** | 3 ペルソナ: ① 決めることに疲れた現代人 ② 罪悪感に弱い人 ③ 自分の意志を強く持っている人（**対比ペルソナ** — YesMan が刺さらない観察対象として記述） |
| **ペルソナ記述項目 (Q5)** | 最小 (名前 / 年齢 / 職業 / モチベーション / ペインポイント) |
| **AC スタイル (Q6)** | Gherkin (Given-When-Then) で 1 AC = 1 シナリオ |
| **ジャーニー (Q7 + CQ4 + CQ5)** | A オンボーディング / B コア決定ループ / C No 連打 / D 沈黙演出（UX 体験のみ） / E 学習効果体験 / F 設定切替（Internal/Dev） |
| **審査員シナリオ (Q8 + CQ6)** | 完全に何もしない（特別配慮なし） |
| **優先度 (Q9)** | 優先度付与なし (全ストーリーが MVP として等価 = 全部 Must) |
| **要件 ID トレーサビリティ (Q10)** | 紐付け不要（Construction で別途整理） |
| **倫理境界 (Q11 + CQ1)** | ストーリーには **UX 体験のみ**を記述。倫理的判断基準は別途 RFC / 設計ドキュメント |
| **開発者ストーリー (Q12 + CQ3)** | ペルソナ Q4 の 3 つは維持。開発者ストーリーは `stories.md` の **Internal/Dev セクション** として独立配置（Journey F に対応） |

## 3. 実行ステップ (承認後に Part 2 で実行)

- [ ] `aidlc-docs/inception/user-stories/personas.md` を作成（3 ペルソナ、最小フォーマット、対比ペルソナを明示）
- [ ] `aidlc-docs/inception/user-stories/stories.md` を User Journey-Based で作成し、6 ジャーニー（A〜F）を Epic 相当の章として構造化
- [ ] **Journey A** オンボーディング: 起動 → 趣旨説明（免責）→ サインアップ → プロフィール入力 → 初回提案
- [ ] **Journey B** コア決定ループ: 入力 → 合議 → 提案 → スワイプ → 結果保存 → スコア更新
- [ ] **Journey C** No 連打体験: 別案再生成 → 罪悪感マイクロコピー → AI の問い直し → 最終的に Yes
- [ ] **Journey D** 沈黙演出: 4 カテゴリ (宗教 / 選挙 / 暴力 / 卑猥) を入力 → AI 沈黙 → 体験的衝撃（**UX 体験のみ**、倫理基準は記載しない）
- [ ] **Journey E** 学習効果体験: 履歴蓄積 → 嗜好に沿った提案 → ユーザーが学習を体感
- [ ] **Journey F** 設定切替（**Internal/Dev セクション**）: 認証 / 永続化 / LLM / 音声バックエンドを開発時に切替
- [ ] 各ストーリーは Classic「As a..., I want..., so that...」形式で記述
- [ ] 各ストーリーに Gherkin AC（Given-When-Then）を 2〜4 個付与
- [ ] 各ストーリーは半日〜1日で実装可能な粒度に保つ
- [ ] 「自分の意志を強く持っている人」ペルソナは対比ペルソナとしてマップに含め、Noを連打する観察対象としてストーリーに登場させる
- [ ] **INVEST 検証**: Independent / Negotiable / Valuable / Estimable / Small / Testable を全ストーリーで確認
- [ ] ペルソナとストーリーのマッピング表を末尾に作成
- [ ] レビュー用サマリ（ペルソナ数 / Journey 数 / ストーリー数 / Internal/Dev ストーリー数）を提示

## 4. 計画承認

回答とクラリフィケーションを反映した本計画でストーリー生成 (Part 2) を進めます。承認後、Part 2 を自動実行します。
