# Amazon Hackathon Demo Scenarios — drill-down で Amazon consumer service へ着地

**目的**: 既存 drill-down アルゴリズム (MAX_DRILL_DEPTH=4 + early-final signal + service_catalog) を利用して、user の日常的なお題から **Amazon consumer service** (Prime Video / Music / Kindle / Audible / Fashion / Prime Gaming / Amazon.co.jp) への自然な着地を **10 パターン** 用意した demo 集.

**前提**:
- API server: Azure gpt-5.4-nano 経由 (`LLM_PROVIDER=litellm`)
- Web server: http://localhost:5173/decision
- service_catalog: 2026-05-26 修正版 (Audible 追加 + keyword 拡張)

**実演方法**:
1. ブラウザで http://localhost:5173/decision を開く
2. 下記 「お題 (user input)」 を 1 つ選んで textbox に入力 → 送信
3. proposal が出たら **Yes を押下** (or 右 swipe / ArrowRight)
4. 2 〜 4 回 Yes を繰り返す
5. final card (pink banner「✨ これで決定。Yes で 外部サービスへ →」) が出たら **Yes で 確定**
6. 新タブで Amazon 系 service が開く

## 10 シナリオ一覧

### Pattern 1: 映画 見たい → Amazon Prime Video 📺

| 項目 | 内容 |
|---|---|
| お題 | `映画 見たい` |
| chain 期待 | 配信で 観る → 気分 / ジャンル → 作品名 |
| final example | 「『パターソン』 を Amazon Prime Video で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/Amazon-Video |
| category | movie (Amazon Prime Video = first preference) |

---

### Pattern 2: アニメ 観たい → Amazon Prime Video 📺

| 項目 | 内容 |
|---|---|
| お題 | `アニメ 観たい` |
| chain 期待 | 配信 → 新作 / 名作 → 作品名 |
| final example | 「『鬼滅の刃』 を Amazon Prime Video で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/Amazon-Video |
| 仕掛け | movie keyword に「アニメ」 単独追加済 |

---

### Pattern 3: 音楽 聴きたい → Amazon Music 🎵

| 項目 | 内容 |
|---|---|
| お題 | `音楽 聴きたい` |
| chain 期待 | 配信 → ジャンル / 気分 → アーティスト / プレイリスト |
| final example | 「King Gnu の 最新 EP を Amazon Music で 開きますか?」 |
| 着地 URL | https://music.amazon.co.jp/ |
| category | music (Amazon Music = first preference) |

---

### Pattern 4: 本 読みたい → Kindle 📚

| 項目 | 内容 |
|---|---|
| お題 | `本 読みたい` |
| chain 期待 | 電子書籍 → ジャンル → 書名 |
| final example | 「『嫌われる勇気』 を Kindle で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/kindlestore |
| category | books (Kindle = first preference) |

---

### Pattern 5: マンガ 読みたい → Kindle 📚

| 項目 | 内容 |
|---|---|
| お題 | `マンガ 読みたい` |
| chain 期待 | 電子書籍 → ジャンル → 作品名 |
| final example | 「『推しの子』 1 巻を Kindle で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/kindlestore |
| 仕掛け | books keyword に「マンガ」 既登録 |

---

### Pattern 6: オーディオブック 聴きたい → Audible 🎧

| 項目 | 内容 |
|---|---|
| お題 | `オーディオブック 聴きたい` |
| chain 期待 | ながら聴き → ジャンル (ビジネス / 自己啓発 / 小説) → 書名 |
| final example | 「『嫌われる勇気』 を Audible で 開きますか?」 |
| 着地 URL | https://www.audible.co.jp/ |
| 仕掛け | **新規追加**: books category に Audible を 2 番目に登録、keyword に「オーディオブック / ながら聴き / 朗読」 追加 |
| 着地条件 | proposal text に「Audible」 が含まれれば pick_service の完全名マッチで Audible が選ばれる |

---

### Pattern 7: 服 欲しい → Amazon Fashion 👔

| 項目 | 内容 |
|---|---|
| お題 | `服 欲しい` |
| chain 期待 | 通販 → カテゴリ (T シャツ / アウター 等) → アイテム名 |
| final example | 「『Amazon Essentials メンズ T シャツ 5 枚セット』 を Amazon Fashion で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/fashion |
| category | fashion (Amazon Fashion = first preference) |

---

### Pattern 8: 日用品 買いたい → Amazon (shopping) 📦

| 項目 | 内容 |
|---|---|
| お題 | `日用品 買いたい` |
| chain 期待 | 通販で 一気に → カテゴリ (洗剤 / 紙類 等) → 商品 |
| final example | 「『アタック 抗菌 EX 4kg』 を Amazon で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/ |
| 仕掛け | shopping keyword に「日用品 / 生活用品」 追加済 |

---

### Pattern 9: ゲーム したい → Amazon Prime Gaming 🎮

| 項目 | 内容 |
|---|---|
| お題 | `ゲーム したい` |
| chain 期待 | サブスク → カジュアル / 本格 → 作品名 |
| final example | 「『Fall Guys』 を Amazon Prime Gaming で 開きますか?」 |
| 着地 URL | https://gaming.amazon.com/ |
| category | games (Amazon Prime Gaming = first preference) |

---

### Pattern 10: ガジェット / 家電 欲しい → Amazon (shopping) 📦

| 項目 | 内容 |
|---|---|
| お題 | `ガジェット 欲しい` (または `家電 欲しい`) |
| chain 期待 | 通販で 比較 → カテゴリ (イヤホン / カメラ 等) → 商品名 |
| final example | 「『Echo Show 5 第 3 世代』 を Amazon で 開きますか?」 |
| 着地 URL | https://www.amazon.co.jp/ |
| 仕掛け | shopping keyword に「家電 / ガジェット / 雑貨」 追加済 |

## 仕掛けまとめ ([service_catalog.py](apps/api/src/yesman_api/domain/decision/service_catalog.py) 2026-05-26 修正)

| 修正 | 内容 |
|---|---|
| 新規 service | `Audible` ($https://www.audible.co.jp/$) を books category に追加 (Kindle の次に登録) |
| movie keyword 拡張 | 「アニメ」 単独 keyword 追加 (既存「アニメ映画」 と並列) |
| books keyword 拡張 | 「オーディオブック」「ながら聴き」「朗読」 追加 (Audible 着地用) |
| shopping keyword 拡張 | 「日用品」「生活用品」「家電」「ガジェット」「雑貨」 追加 |
| 既存挙動 | 他 7 シナリオ (映画 / マンガ / 本 / 音楽 / 服 / ゲーム / 通販) は既存 catalog で着地済 |

## 実演 sequence 例 (Pattern 1 「映画 見たい」)

```
[depth=0] root  : 「気分に合いそうな映画を 1 本 観ようどう?」
              ↓ Yes
[depth=1] media : 「配信で 観るのは どう?」
              ↓ Yes
[depth=2] subtype: 「コメディ作品で リラックスしようか?」
              ↓ Yes (early-final 期待)
[depth=3] final : 「『君の名は。』 を Amazon Prime Video で 開きますか?」
              🎉 Yes → 新タブで https://www.amazon.co.jp/Amazon-Video が開く
```

(LLM の判断で 3 click で final or 5 click で MAX 到達、どちらでも final に着地する設計)

## 注意点

- **実 LLM (Azure gpt-5.4-nano)** で動作するため、proposal text の固有名 (作品名 / 商品名) は **毎回異なる**
- **Yes 連打回数は 3 〜 5 click**: LLM が「これで決まり!」 等の決定 signal を出した時点で early-final 化 (`_detect_final_signal()`)
- **service が hit しない場合は NudgeBanner のみ** (現状 popup なし、pink banner「Yes で 決まり ♪」). 10 シナリオ全件で service hit を確認済
- **popup block**: ブラウザの popup blocker が ON の場合、新タブが開かない可能性 → fallback として既存緑グラデ CTA button「📺 XXX で開く →」 が常時表示されているので手動 click 可

## 関連 docs

- [requirements.md v2](../inception/drill-down-auto-open/requirements.md)
- [application-design.md](../inception/drill-down-auto-open/application-design.md)
- [phase-summary.md](../construction/drill-down-auto-open/code/phase-summary.md)
- [proposal-final-before-after.html](../inception/drill-down-auto-open/mockups/proposal-final-before-after.html) (UI mockup)
