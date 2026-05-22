# Profile 編集機能 — Design Spec

- **Date**: 2026-05-20
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**: `apps/web/src/features/profile/` 配下のみ。API / DB / 認証は変更なし。

---

## 1. 背景

ProfilePage (`/profile`) の「基本属性」セクションは現在 read-only で、`年齢層 / 職業 / 価値観タグ / 性別 / ライフステージ` がすべて「未設定」のまま編集 UI がない。

一方で:

- API (`PATCH /v1/profiles/me`) は全フィールド optional の部分更新を **既に実装済み** ([profiles.py:36-60](../../../apps/api/src/yesman_api/interface/http/profiles.py#L36-L60))
- React Query mutation hook (`useUpdateProfile`) も **既に実装済み** ([useProfile.ts:13-23](../../../apps/web/src/features/profile/useProfile.ts#L13-L23))
- strings.ts には `saveButton` / `saveSuccess` が定義済み ([strings.ts:14-15](../../../apps/web/src/features/profile/strings.ts#L14-L15))

つまり「編集 UI を ProfilePage に組み込むだけ」で完結する。

---

## 2. ユーザストーリー

> 田中 涼介 (PdM, 32) として、初回ログイン後 / 任意のタイミングでプロフィール画面から自分の年齢層・職業・価値観タグ・性別・ライフステージを編集したい。AI 合議の精度向上と委任度スコアの可視化に反映されるからだ。

### 受入基準 (Gherkin)

```
Given /profile にログイン済みで遷移している
And 基本属性は read-only で表示されている
When [編集] ボタンをクリックする
Then 基本属性 Card 内が編集フォームに切り替わる
And 各フィールドには現在の値が初期入力される
And [キャンセル] [保存] ボタンが表示される

When フォームを変更して [保存] をクリックする
Then PATCH /v1/profiles/me が呼ばれる
And 成功すれば「保存しました」toast が表示される
And Card が read-only モードに戻り、新しい値が表示される

When [キャンセル] をクリックする
Then 編集中の値は破棄され、Card が read-only モードに戻る

When 保存に失敗する (network / 5xx)
Then エラー toast が表示され、編集モードは維持される
```

---

## 3. アーキテクチャ

### 3.1 Component 構成

```
ProfilePage
├─ <Card> Sub / Email (変更なし)
├─ <BasicAttributesCard />              ← 新規 (基本属性 Card 全体)
│   ├─ <ViewMode />  (現状の dl/dt/dd + [編集] ボタン)
│   └─ <EditMode />  (form)
│       ├─ <AgeGroupSelect />
│       ├─ <OccupationInput />
│       ├─ <ValueTagsChips />     (preset toggle + 自由追加)
│       ├─ <GenderChips />        (preset toggle, multi)
│       ├─ <LifeStageSelect />
│       └─ [キャンセル] [保存]
├─ <Card> 🎤 音声入力 backend (変更なし)
└─ <Card> アカウント削除 (変更なし)
```

`BasicAttributesCard` の内部 sub-component は同一ファイル内 (function components) で実装する。**ファイル分割しすぎない**方針。

### 3.2 State machine

```
       [編集]
view ─────────→ edit
 ↑               │
 │  [キャンセル]  │
 ├───────────────┤
 │               │
 │  [保存 OK]    │
 ├───────────────┤
 │               │
 │  [保存 NG]    │
 └─── (stay) ←──┘
```

- `editing: boolean` — Card の表示モード
- `draft: ProfileDraft` — 編集中の値 (全フィールド `string | string[] | null`)
- `saving: boolean` — `useUpdateProfile.isPending` を反映

### 3.3 Data flow

```
useProfile() (existing)
      │  ProfileResponse
      ▼
BasicAttributesCard
      │
      ├─ ViewMode  ────── [編集] ────→ setEditing(true)
      │                                setDraft(toDraft(profile))
      │
      └─ EditMode
              ├─ <select>/<input>/chips ─→ setDraft(...)
              ├─ [キャンセル] ───────────→ setEditing(false), setDraft(null)
              └─ [保存] ─────────────────→ useUpdateProfile.mutateAsync(toPayload(draft))
                                            ├─ onSuccess: toast("保存しました")
                                            │             setEditing(false)
                                            │             QC.invalidateQueries(["profile"])
                                            └─ onError:   toast(err, "error")
                                                          (editing 維持)
```

---

## 4. Preset 値定義 (`presets.ts`)

```ts
export const AGE_GROUP_PRESETS = [
  "10代", "20代", "30代", "40代", "50代", "60代", "70代以上",
] as const;

export const LIFE_STAGE_PRESETS = [
  "学生", "社会人", "独身", "既婚", "子育て中", "退職後",
] as const;

export const GENDER_PRESETS = [
  "男性", "女性", "その他", "回答しない",
] as const;

export const VALUE_TAG_PRESETS = [
  "効率重視", "慎重", "楽観", "共感重視",
  "冒険的", "安定志向", "計画的", "直感的",
] as const;
```

| Field | Type | 入力 UI | 自由追加 |
|---|---|---|---|
| age_group | `string \| null` | `<select>` | 不可 |
| occupation | `string \| null` | `<input type=text>` | (常に自由) |
| value_tags | `string[]` | chip toggle + `+` 追加 | **可** |
| gender | `string[]` | chip toggle (multi) | 不可 |
| life_stage | `string \| null` | `<select>` | 不可 |

---

## 5. Validation / 制約

API 側 (`ProfileUpdateRequest`) と同期:

| Field | フロント制約 | API 制約 |
|---|---|---|
| age_group | `<select>` (preset 値のみ) | max_length=20 |
| occupation | `maxLength=100` 属性 | max_length=100 |
| value_tags | 要素数 ≤ 20、要素長 ≤ 50 | リスト長 ≤ 20 |
| gender | 要素数 ≤ 10 (preset 4 件なので実質無制限) | リスト長 ≤ 10 |
| life_stage | `<select>` (preset 値のみ) | max_length=50 |

リスト上限到達時: 「+ 追加」 ボタンを `disabled` + tooltip / 注記表示。

空文字 / 未選択は `null` に正規化してから PATCH 送信 (`exclude_unset` で送らないのが理想だが、PATCH では「null をクリアの意味で送る」運用)。

---

## 6. Payload 変換ルール (`toPayload`)

```ts
function toPayload(draft: ProfileDraft): ProfileUpdateRequest {
  return {
    age_group: draft.age_group?.trim() || null,
    occupation: draft.occupation?.trim() || null,
    value_tags: Array.from(new Set(draft.value_tags.filter(Boolean))),
    gender: Array.from(new Set(draft.gender.filter(Boolean))),
    life_stage: draft.life_stage?.trim() || null,
  };
}
```

- 空文字 → `null` (= クリアの意味)
- リストは重複排除 + 空要素除外
- `preferences` は scope 外なので touch しない

---

## 7. Error handling

| 失敗ケース | 挙動 |
|---|---|
| network error / 5xx | toast `variant="error"` でエラーメッセージ、編集モード維持 |
| 422 validation error (API 側) | toast に API メッセージ表示、編集モード維持 |
| 401 (auth 失効) | 既存 ApiProvider の interceptor に従う (再ログインへ) |
| QC invalidate 失敗 | 無視 (次回 fetch でリカバリ) |

---

## 8. 変更ファイル一覧

| 種別 | パス | 内容 |
|---|---|---|
| 新規 | `apps/web/src/features/profile/BasicAttributesCard.tsx` | Card 全体 (View + Edit) |
| 新規 | `apps/web/src/features/profile/presets.ts` | preset 定数 |
| 編集 | `apps/web/src/features/profile/ProfilePage.tsx` | 基本属性 Card 部分を `<BasicAttributesCard />` に置換 |
| 編集 | `apps/web/src/features/profile/strings.ts` | i18n key 追加 (editButton, cancelButton, tagAddButton, tagAddPlaceholder, validationListFull, etc.) |
| 新規 | `apps/web/src/features/profile/BasicAttributesCard.test.tsx` | Vitest unit (View ↔ Edit 切替、save 呼出、cancel 破棄) |
| 編集 (optional) | `tests/e2e/profile.spec.ts` (既存 or 新規) | Playwright e2e (任意、stretch) |

---

## 9. テスト方針

### 9.1 Unit (Vitest, 必須)

`BasicAttributesCard.test.tsx`:

1. ViewMode の初期表示 (data 未設定 → placeholder)
2. ViewMode の初期表示 (data 設定済み → 値が表示される)
3. [編集] クリック → EditMode に切替、draft が data で初期化される
4. select 変更 / chip 切替 / 自由追加で draft が更新される
5. [保存] → `useUpdateProfile.mutateAsync` が `toPayload(draft)` で呼ばれる
6. mutation onSuccess → ViewMode に戻る + toast
7. mutation onError → EditMode 維持 + error toast
8. [キャンセル] → ViewMode に戻る + draft 破棄

### 9.2 e2e (Playwright, optional)

- /profile を開く → [編集] → 値変更 → [保存] → toast → リロード後も値保持

---

## 10. Out of Scope

- `preferences: dict[str, str]` フィールド (UI 未表示なので touch しない)
- API スキーマ変更 (PATCH endpoint は既存実装をそのまま利用)
- onboarding 初回入力フロー (将来別 issue)
- 国際化 (i18n は strings.ts に集約済み、英語化は別 issue)
- 嗜好プロファイル (`/preferences` 画面) との連動表示

---

## 11. Git-Flow

- ブランチ: `feature/profile-edit-ui` (Issue 番号なし、hackathon pragmatism)
- ベース: `develop`
- マージ: squash merge → `develop`
- コミット規約: Conventional Commits、`feat(web): Profile 基本属性のインライン編集 UI を追加`
- AI-assisted trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

## 12. リスク・トレードオフ

| リスク | 影響 | 緩和策 |
|---|---|---|
| preset 値が user の表現と合わない | 採用率低下 | 価値観タグは自由追加可能、他は preset で範囲限定 (将来拡張) |
| 同時編集 (multi-tab) で stale draft | データ上書き | QC invalidate 任せ + 保存後即 refetch。conflict 検出は実装しない |
| 性別 list[str] の UX 混乱 | 直感性低下 | 「複数選択可」と注記 + preset を 4 件に限定 |
| 自由追加タグの重複 / 表記揺れ | 学習側のノイズ | フロントで normalize (trim + 重複排除)、嗜好学習側は API 既存ロジック任せ |

---

## 13. 完了基準

- [ ] `BasicAttributesCard.tsx` / `presets.ts` 実装完了、ProfilePage に組み込み
- [ ] strings.ts に i18n key 追加
- [ ] Vitest unit 全 8 ケース pass
- [ ] `pnpm --filter @yesman/web build` / `pnpm --filter @yesman/web lint` pass
- [ ] ブラウザでマニュアル動作確認 (Mock mode で /profile → 編集 → 保存 → toast)
- [ ] `feature/profile-edit-ui` ブランチで squash merge PR 作成

---
