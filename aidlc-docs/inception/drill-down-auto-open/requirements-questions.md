# drill-down-auto-open — Requirements Clarification Questions

**Feature**: drill-down decision の最終段で proposal を疑問形「XXX で開きますか?」にし、Yes 採択時に外部 service URL を自動 open する。

**Workflow**: AI-DLC INCEPTION / Requirements Analysis (Standard depth)
**Created**: 2026-05-26
**Status**: Awaiting user answers

---

## Intent 分析 (再掲)

**現状**:
- depth=MAX で proposal_text は断定調 (例: 「『パターソン』を Amazon Prime Video で 観ましょう。」)
- Yes 採択 → choose API + NudgeBanner + 別途 CTA button (緑グラデ「📺 Amazon Prime Video で開く →」)
- user は CTA を **自分でもう一度 click** して外部サイトへ

**新仕様**:
- depth=MAX で proposal_text は疑問形 (例: 「『パターソン』を Amazon Prime Video で **開きますか?**」)
- Yes 採択 → choose API + **自動的に外部サイトを open** (window.open `_blank`)
- user の追加 click 不要

以下、設計選択肢を 1 つずつ確認させてください。

---

## Question 1: proposal text (最終段) の表現

depth=MAX (final) で LLM が出す proposal を以下のどの形式にしますか?

A) **疑問形 1 文「XXX で 開きますか?」固定** — 例: 「『貞子 on the Movie』を Amazon Prime Video で 開きますか?」
B) 断定 + 末尾に「開く?」付加 — 例: 「『貞子』を Amazon Prime Video で 観よう。開く?」
C) 現状の断定調を維持 + UI ボタン label を「Yes、開く」に変更 (LLM 触らず)
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2: Yes 採択時の動作

Yes 採択時に外部サイトをどう open しますか?

A) **新タブで open + NudgeBanner も表示** — `window.open(url, "_blank")` + 祝福 banner で UI に残る (戻れば「もう一度」可能)
B) 新タブで open + NudgeBanner スキップ — トースト「開きました」のみ、即遷移感
C) 同タブで open (画面遷移) — `location.href = url` (戻ると合議 state が消える)
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3: 既存 CTA button (緑グラデ「📺 XXX で開く →」) の扱い

新仕様で Yes が自動 open するなら、現状の CTA button はどうしますか?

A) **表示を継続 (popup ブロック時の fallback)** — Yes で自動 open が失敗した場合 user が手動で押せる
B) 削除 — Yes = 自動 open に一本化、UI シンプル化
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4: 対象 service の範囲

Amazon 以外の service (出前館 / ユニクロ / Steam / じゃらん 等) も同じ振る舞いにしますか?

A) **全 service で同一振る舞い** — `service_payload` がある限り「開きますか?」+ 自動 open
B) Amazon 系のみ自動 open、他は現状維持 (CTA button のみ)
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5: popup ブロック対策

ブラウザは「ユーザー操作直後でない window.open」 を block することがあります。Yes click handler 内で同期 open するなら通常 OK ですが、`choose` API call の await を挟む場合 block されることがあります。対策をどうしますか?

A) **API await の前に open() を発火** — service URL は SSE proposal event 受信時点で確定済なので、Yes click handler の同期 path で先に window.open()、その後 await choose() を呼ぶ (popup block 回避)
B) `await choose()` 後に open()、ブロック時は CTA button を fallback として活用 (Q3=A 必須)
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6: 受け入れ基準 (Gherkin 風で確認)

以下を **受け入れ基準** として fix していいですか?

```gherkin
Scenario: drill-down 最終段で Yes 採択 → 外部サイト自動 open
  Given user が「映画見たい」で合議を開始
  And Yes を 4 回連打して depth=4 (final) に到達
  And final proposal が「『パターソン』を Amazon Prime Video で 開きますか?」と表示される
  And service: { name: "Amazon Prime Video", url: "https://www.amazon.co.jp/Amazon-Video", emoji: "📺" }
  When user が Yes button を click (または右 swipe)
  Then 新タブで service.url が open される
  And 元タブには NudgeBanner (祝福) が表示される
  And choose API は yes として記録される

Scenario: 中間段 (depth < MAX) の Yes は drill-down 継続 (現状維持)
  Given depth=2 で proposal "配信で 観ますか?" が表示
  When user が Yes
  Then 次段 stream が開始される (window.open は呼ばれない)
```

A) **この受け入れ基準で OK**
B) 修正案あり (after [Answer]: tag に記載)
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 回答完了後のお願い

すべての `[Answer]:` 欄に letter (A/B/C/D) を埋めたら、**「完了」「done」「OK」** のいずれかで知らせてください。次に `requirements.md` を起こします。
