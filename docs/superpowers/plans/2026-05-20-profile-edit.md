# Profile 編集機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ProfilePage の「基本属性」Card に inline 編集 UI を追加し、`PATCH /v1/profiles/me` を通じて 5 フィールド (age_group / occupation / value_tags / gender / life_stage) を編集できるようにする。

**Architecture:** ProfilePage から「基本属性」Card を `BasicAttributesCard` に切り出し。同 component 内で `editing: boolean` と `draft: ProfileDraft` の local state を持ち、`useUpdateProfile` mutation で保存。preset 値は `presets.ts` に集約。

**Tech Stack:** React 18 / TypeScript / Vite / TanStack Query / `@yesman/ui` (Card, Button, Input, useToast) / MSW (test) / Vitest + jsdom + @testing-library/react

**Spec:** [docs/superpowers/specs/2026-05-20-profile-edit-design.md](../specs/2026-05-20-profile-edit-design.md)

**Branch:** `feature/profile-edit-ui` (既に作成済み、spec commit 1 件あり)

---

## File Structure

```
apps/web/src/features/profile/
├── ProfilePage.tsx           [Modify] 基本属性 Card を <BasicAttributesCard /> に置換
├── BasicAttributesCard.tsx   [Create] View ↔ Edit Card 全体
├── presets.ts                [Create] 各フィールドの preset 値定数
├── strings.ts                [Modify] i18n key 追加
├── useProfile.ts             [unchanged] useProfile / useUpdateProfile (既存)
apps/web/tests/features/profile/
├── BasicAttributesCard.test.tsx  [Create] Vitest unit test
```

---

## Task 1: presets.ts + strings.ts (静的データ)

**Files:**
- Create: `apps/web/src/features/profile/presets.ts`
- Modify: `apps/web/src/features/profile/strings.ts`

- [ ] **Step 1: presets.ts を作成**

Create `apps/web/src/features/profile/presets.ts`:

```ts
/** Profile 基本属性の preset 選択肢 (BasicAttributesCard で使用). */

export const AGE_GROUP_PRESETS = [
  "10代",
  "20代",
  "30代",
  "40代",
  "50代",
  "60代",
  "70代以上",
] as const;

export const LIFE_STAGE_PRESETS = [
  "学生",
  "社会人",
  "独身",
  "既婚",
  "子育て中",
  "退職後",
] as const;

export const GENDER_PRESETS = [
  "男性",
  "女性",
  "その他",
  "回答しない",
] as const;

export const VALUE_TAG_PRESETS = [
  "効率重視",
  "慎重",
  "楽観",
  "共感重視",
  "冒険的",
  "安定志向",
  "計画的",
  "直感的",
] as const;

export const PROFILE_LIMITS = {
  AGE_GROUP_MAX_LENGTH: 20,
  OCCUPATION_MAX_LENGTH: 100,
  LIFE_STAGE_MAX_LENGTH: 50,
  VALUE_TAG_MAX_LENGTH: 50,
  VALUE_TAGS_MAX_COUNT: 20,
  GENDER_MAX_COUNT: 10,
} as const;
```

- [ ] **Step 2: strings.ts に編集 UI 用 key を追加**

Modify `apps/web/src/features/profile/strings.ts` — `STRINGS` object に以下を追加 (saveButton / saveSuccess は既存):

```ts
  // 編集 UI (BasicAttributesCard)
  editButton: "編集",
  saveError: "保存に失敗しました",
  tagAddPlaceholder: "カスタムタグを追加",
  tagAddButton: "追加",
  tagsFullNotice: "タグは最大 20 件までです",
  genderHint: "(複数選択可)",
  occupationPlaceholder: "例: ソフトウェアエンジニア",
```

Final `STRINGS` shape (insert these keys before `deleteSectionTitle`):

```ts
export const STRINGS = {
  pageTitle: "プロフィール",
  fieldEmail: "Email",
  fieldSub: "Sub",
  fieldAgeGroup: "年齢層",
  fieldOccupation: "職業 (任意)",
  fieldValueTags: "価値観タグ (複数可)",
  fieldGender: "性別",
  fieldLifeStage: "ライフステージ",
  valueTagsPlaceholder: "効率重視 / 慎重 / 楽観 ...",
  ageGroupPlaceholder: "20代 / 30代 / 40代...",
  saveButton: "保存",
  saveSuccess: "保存しました",
  // ↓ 新規
  editButton: "編集",
  saveError: "保存に失敗しました",
  tagAddPlaceholder: "カスタムタグを追加",
  tagAddButton: "追加",
  tagsFullNotice: "タグは最大 20 件までです",
  genderHint: "(複数選択可)",
  occupationPlaceholder: "例: ソフトウェアエンジニア",
  // ↑ 新規
  deleteSectionTitle: "アカウント削除",
  deleteButton: "アカウント削除",
  deleteModalTitle: "アカウント削除確認",
  deleteWarning: "すべてのデータ (Profile / Decision history / Persona / Selection) が完全に削除されます。",
  deleteUnrecoverable: "この操作は取消できません。",
  deleteConfirmLabel: "上記を理解し、アカウントを削除することに同意します。",
  deleteFinalButton: "完全に削除する",
  cancelButton: "キャンセル",
  deleteSuccess: "アカウントを削除しました",
} as const;
```

- [ ] **Step 3: TypeScript 型チェック**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/profile/presets.ts apps/web/src/features/profile/strings.ts
git commit -m "$(cat <<'EOF'
feat(web): Profile 編集 UI の preset 値と i18n 文字列を追加

- presets.ts: age_group / life_stage / gender / value_tags の preset 配列
- strings.ts: editButton / saveError / tagAddPlaceholder 等 7 key 追加
- PROFILE_LIMITS: API ProfileUpdateRequest の max_length と同期

Refs: docs/superpowers/specs/2026-05-20-profile-edit-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: BasicAttributesCard skeleton + ViewMode (TDD)

**Files:**
- Create: `apps/web/src/features/profile/BasicAttributesCard.tsx`
- Create: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

Create `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`:

```tsx
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@yesman/ui";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { BasicAttributesCard } from "../../../src/features/profile/BasicAttributesCard";
import type { Profile } from "@yesman/api-client";

const server = setupServer();

function renderCard(profile: Profile | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <BasicAttributesCard profile={profile} />
          </ToastProvider>
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}

const EMPTY: Profile = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "test@example.com",
  age_group: null,
  occupation: null,
  value_tags: [],
  gender: [],
  preferences: {},
  life_stage: null,
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
};

const FILLED: Profile = {
  ...EMPTY,
  age_group: "30代",
  occupation: "PdM",
  value_tags: ["効率重視", "慎重"],
  gender: ["女性"],
  life_stage: "社会人",
};

describe("BasicAttributesCard — ViewMode", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("空 profile では placeholder を表示する", () => {
    renderCard(EMPTY);
    expect(screen.getByText("基本属性")).toBeInTheDocument();
    // 年齢層・ライフステージなどは未設定 placeholder
    expect(screen.getAllByText(/未設定|20代 \/ 30代/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
  });

  it("値が入った profile は各フィールドを表示する", () => {
    renderCard(FILLED);
    expect(screen.getByText("30代")).toBeInTheDocument();
    expect(screen.getByText("PdM")).toBeInTheDocument();
    expect(screen.getByText("効率重視 / 慎重")).toBeInTheDocument();
    expect(screen.getByText("女性")).toBeInTheDocument();
    expect(screen.getByText("社会人")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: FAIL with "Cannot find module ... BasicAttributesCard"

- [ ] **Step 3: BasicAttributesCard.tsx skeleton + ViewMode 実装**

Create `apps/web/src/features/profile/BasicAttributesCard.tsx`:

```tsx
/**
 * BasicAttributesCard — Profile 基本属性の View ↔ Edit Card.
 *
 * spec: docs/superpowers/specs/2026-05-20-profile-edit-design.md
 */
import { useState } from "react";
import { Button, Card } from "@yesman/ui";
import type { Profile } from "@yesman/api-client";
import { t } from "./strings";

export interface BasicAttributesCardProps {
  profile: Profile | undefined;
}

export function BasicAttributesCard({ profile }: BasicAttributesCardProps) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif font-semibold">基本属性</h2>
        {!editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t("editButton")}
          </Button>
        )}
      </div>
      {!editing && <ViewMode profile={profile} />}
    </Card>
  );
}

function ViewMode({ profile }: { profile: Profile | undefined }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
      <dt className="font-semibold">{t("fieldAgeGroup")}:</dt>
      <dd className="text-neutral-700">
        {profile?.age_group ? (
          String(profile.age_group)
        ) : (
          <span className="italic text-neutral-400">{t("ageGroupPlaceholder")}</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldOccupation")}:</dt>
      <dd className="text-neutral-700">
        {profile?.occupation ? (
          String(profile.occupation)
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldValueTags")}:</dt>
      <dd className="text-neutral-700">
        {profile?.value_tags && profile.value_tags.length > 0 ? (
          profile.value_tags.join(" / ")
        ) : (
          <span className="italic text-neutral-400">{t("valueTagsPlaceholder")}</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldGender")}:</dt>
      <dd className="text-neutral-700">
        {profile?.gender && profile.gender.length > 0 ? (
          profile.gender.join(" / ")
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldLifeStage")}:</dt>
      <dd className="text-neutral-700">
        {profile?.life_stage ? (
          String(profile.life_stage)
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
    </dl>
  );
}
```

- [ ] **Step 4: テスト pass を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/profile/BasicAttributesCard.tsx \
        apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): BasicAttributesCard の ViewMode skeleton を追加

profile prop から age_group / occupation / value_tags / gender / life_stage
を read-only 表示。編集ボタンの state は持つが Edit mode は未実装。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Edit toggle + draft 初期化 (TDD)

**Files:**
- Modify: `apps/web/src/features/profile/BasicAttributesCard.tsx`
- Modify: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを追加**

Append to `BasicAttributesCard.test.tsx` (新規 describe block):

```tsx
import userEvent from "@testing-library/user-event";

describe("BasicAttributesCard — EditMode toggle", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("[編集] クリックで edit 用 form 要素が出現する", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    // 編集フォームに切替: select / input / 保存 / キャンセル ボタンが現れる
    expect(screen.getByRole("combobox", { name: /年齢層/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /職業/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });

  it("Edit mode の初期値は profile の現在値で初期化される", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    expect(ageSelect.value).toBe("30代");

    const occupationInput = screen.getByRole("textbox", { name: /職業/ }) as HTMLInputElement;
    expect(occupationInput.value).toBe("PdM");

    const lifeStageSelect = screen.getByRole("combobox", { name: /ライフステージ/ }) as HTMLSelectElement;
    expect(lifeStageSelect.value).toBe("社会人");
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: FAIL — "Unable to find role 'combobox' / 'textbox'"

- [ ] **Step 3: EditMode component と draft state を実装**

Modify `BasicAttributesCard.tsx` — full replacement:

```tsx
/**
 * BasicAttributesCard — Profile 基本属性の View ↔ Edit Card.
 *
 * spec: docs/superpowers/specs/2026-05-20-profile-edit-design.md
 */
import { useState } from "react";
import { Button, Card, Input } from "@yesman/ui";
import type { Profile, ProfileUpdate } from "@yesman/api-client";
import { t } from "./strings";
import {
  AGE_GROUP_PRESETS,
  GENDER_PRESETS,
  LIFE_STAGE_PRESETS,
  PROFILE_LIMITS,
  VALUE_TAG_PRESETS,
} from "./presets";

export interface BasicAttributesCardProps {
  profile: Profile | undefined;
}

interface ProfileDraft {
  age_group: string;
  occupation: string;
  value_tags: string[];
  gender: string[];
  life_stage: string;
}

function toDraft(profile: Profile | undefined): ProfileDraft {
  return {
    age_group: profile?.age_group ?? "",
    occupation: profile?.occupation ?? "",
    value_tags: profile?.value_tags ?? [],
    gender: profile?.gender ?? [],
    life_stage: profile?.life_stage ?? "",
  };
}

export function BasicAttributesCard({ profile }: BasicAttributesCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile));

  const startEdit = () => {
    setDraft(toDraft(profile));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif font-semibold">基本属性</h2>
        {!editing && (
          <Button variant="secondary" onClick={startEdit}>
            {t("editButton")}
          </Button>
        )}
      </div>
      {!editing ? (
        <ViewMode profile={profile} />
      ) : (
        <EditMode
          draft={draft}
          setDraft={setDraft}
          onCancel={cancelEdit}
          onSave={() => {/* Task 5 */}}
          saving={false}
        />
      )}
    </Card>
  );
}

function ViewMode({ profile }: { profile: Profile | undefined }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
      <dt className="font-semibold">{t("fieldAgeGroup")}:</dt>
      <dd className="text-neutral-700">
        {profile?.age_group ? (
          String(profile.age_group)
        ) : (
          <span className="italic text-neutral-400">{t("ageGroupPlaceholder")}</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldOccupation")}:</dt>
      <dd className="text-neutral-700">
        {profile?.occupation ? (
          String(profile.occupation)
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldValueTags")}:</dt>
      <dd className="text-neutral-700">
        {profile?.value_tags && profile.value_tags.length > 0 ? (
          profile.value_tags.join(" / ")
        ) : (
          <span className="italic text-neutral-400">{t("valueTagsPlaceholder")}</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldGender")}:</dt>
      <dd className="text-neutral-700">
        {profile?.gender && profile.gender.length > 0 ? (
          profile.gender.join(" / ")
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
      <dt className="font-semibold">{t("fieldLifeStage")}:</dt>
      <dd className="text-neutral-700">
        {profile?.life_stage ? (
          String(profile.life_stage)
        ) : (
          <span className="italic text-neutral-400">未設定</span>
        )}
      </dd>
    </dl>
  );
}

interface EditModeProps {
  draft: ProfileDraft;
  setDraft: (updater: (prev: ProfileDraft) => ProfileDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

function EditMode({ draft, setDraft, onCancel, onSave, saving }: EditModeProps) {
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="grid grid-cols-[10rem_1fr] items-center gap-2">
        <span className="font-semibold">{t("fieldAgeGroup")}:</span>
        <select
          aria-label={t("fieldAgeGroup")}
          className="block w-full rounded-xl border bg-neutral-0 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={draft.age_group}
          onChange={(e) => setDraft((d) => ({ ...d, age_group: e.target.value }))}
        >
          <option value="">未選択</option>
          {AGE_GROUP_PRESETS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="grid grid-cols-[10rem_1fr] items-center gap-2">
        <span className="font-semibold">{t("fieldOccupation")}:</span>
        <Input
          aria-label={t("fieldOccupation")}
          type="text"
          placeholder={t("occupationPlaceholder")}
          maxLength={PROFILE_LIMITS.OCCUPATION_MAX_LENGTH}
          value={draft.occupation}
          onChange={(e) => setDraft((d) => ({ ...d, occupation: e.target.value }))}
        />
      </label>

      <ChipMultiField
        label={t("fieldValueTags")}
        presets={VALUE_TAG_PRESETS}
        allowCustom
        maxCount={PROFILE_LIMITS.VALUE_TAGS_MAX_COUNT}
        values={draft.value_tags}
        onChange={(vs) => setDraft((d) => ({ ...d, value_tags: vs }))}
      />

      <ChipMultiField
        label={`${t("fieldGender")} ${t("genderHint")}`}
        presets={GENDER_PRESETS}
        allowCustom={false}
        maxCount={PROFILE_LIMITS.GENDER_MAX_COUNT}
        values={draft.gender}
        onChange={(vs) => setDraft((d) => ({ ...d, gender: vs }))}
      />

      <label className="grid grid-cols-[10rem_1fr] items-center gap-2">
        <span className="font-semibold">{t("fieldLifeStage")}:</span>
        <select
          aria-label={t("fieldLifeStage")}
          className="block w-full rounded-xl border bg-neutral-0 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={draft.life_stage}
          onChange={(e) => setDraft((d) => ({ ...d, life_stage: e.target.value }))}
        >
          <option value="">未選択</option>
          {LIFE_STAGE_PRESETS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 justify-end mt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t("cancelButton")}
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {t("saveButton")}
        </Button>
      </div>
    </form>
  );
}

interface ChipMultiFieldProps {
  label: string;
  presets: readonly string[];
  allowCustom: boolean;
  maxCount: number;
  values: string[];
  onChange: (next: string[]) => void;
}

function ChipMultiField({
  label,
  presets,
  allowCustom,
  maxCount,
  values,
  onChange,
}: ChipMultiFieldProps) {
  const [customInput, setCustomInput] = useState("");
  const full = values.length >= maxCount;

  const toggle = (v: string) => {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else if (!full) {
      onChange([...values, v]);
    }
  };

  const addCustom = () => {
    const v = customInput.trim();
    if (!v) return;
    if (values.includes(v)) {
      setCustomInput("");
      return;
    }
    if (full) return;
    onChange([...values, v]);
    setCustomInput("");
  };

  // 表示する preset + 既に追加されたカスタム値 (preset でない) を union
  const allChips = Array.from(new Set([...presets, ...values]));

  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-2">
      <span className="font-semibold pt-1">{label}:</span>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label={label}>
          {allChips.map((v) => {
            const selected = values.includes(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggle(v)}
                aria-pressed={selected}
                className={[
                  "rounded-full px-3 py-1 text-xs border transition-colors",
                  selected
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-neutral-0 text-neutral-700 border-neutral-300 hover:border-brand-500",
                ].join(" ")}
              >
                {v}
              </button>
            );
          })}
        </div>
        {allowCustom && (
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              aria-label={t("tagAddPlaceholder")}
              placeholder={t("tagAddPlaceholder")}
              maxLength={PROFILE_LIMITS.VALUE_TAG_MAX_LENGTH}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              disabled={full}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addCustom}
              disabled={full || !customInput.trim()}
            >
              {t("tagAddButton")}
            </Button>
          </div>
        )}
        {allowCustom && full && (
          <p className="text-xs text-neutral-500 italic">{t("tagsFullNotice")}</p>
        )}
      </div>
    </div>
  );
}

// toPayload は Task 5 で追加する
export function toPayload(draft: ProfileDraft): ProfileUpdate {
  return {
    age_group: draft.age_group.trim() || null,
    occupation: draft.occupation.trim() || null,
    value_tags: Array.from(new Set(draft.value_tags.map((v) => v.trim()).filter(Boolean))),
    gender: Array.from(new Set(draft.gender.map((v) => v.trim()).filter(Boolean))),
    life_stage: draft.life_stage.trim() || null,
  };
}
```

- [ ] **Step 4: テスト pass を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (4 tests; ViewMode 2 + EditMode toggle 2)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/profile/BasicAttributesCard.tsx \
        apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): BasicAttributesCard に EditMode + draft state を追加

[編集] click で form 表示に切替、profile から draft を初期化。
select / Input / chip-multi 各フィールド + [保存] [キャンセル] を実装
(保存ロジックは Task 5 で接続)。toPayload helper も先行追加。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 編集フォームの入力反映 + chip 操作 (TDD)

**Files:**
- Modify: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを追加**

Append new describe block to test file:

```tsx
describe("BasicAttributesCard — Edit interactions", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("select 変更で draft 値が更新される (age_group)", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    await user.selectOptions(ageSelect, "40代");
    expect(ageSelect.value).toBe("40代");
  });

  it("text input 変更で occupation が更新される", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const occInput = screen.getByRole("textbox", { name: /職業/ }) as HTMLInputElement;
    await user.type(occInput, "Engineer");
    expect(occInput.value).toBe("Engineer");
  });

  it("preset chip クリックで value_tags が toggle される", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    // 「効率重視」chip を click
    const chip = screen.getByRole("button", { name: "効率重視", pressed: false });
    await user.click(chip);
    // 同じ chip が selected (aria-pressed=true) に
    expect(screen.getByRole("button", { name: "効率重視", pressed: true })).toBeInTheDocument();

    // もう一度 click で外れる
    await user.click(screen.getByRole("button", { name: "効率重視", pressed: true }));
    expect(screen.getByRole("button", { name: "効率重視", pressed: false })).toBeInTheDocument();
  });

  it("カスタムタグを追加できる (Enter / [追加] button)", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const customInput = screen.getByRole("textbox", { name: "カスタムタグを追加" });
    await user.type(customInput, "ミニマリスト{Enter}");

    // 追加された chip が selected (aria-pressed=true) で存在
    expect(screen.getByRole("button", { name: "ミニマリスト", pressed: true })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト実行**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (8 tests total — 既に Task 3 の component 実装で機能はカバー済み、test 追加のみ)

> 注: もし fail する場合は aria-label の付け方 / userEvent の Enter キー処理周りを再確認。preset chip の aria-pressed 属性は Task 3 の component 実装で既に付いている。

- [ ] **Step 3: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
test(web): BasicAttributesCard の Edit interactions テストを追加

select 変更 / text input / chip toggle / カスタムタグ追加 (Enter)
の 4 ケースを検証。Task 3 の実装に対するカバレッジ強化。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Save mutation 接続 + 成功 path (TDD)

**Files:**
- Modify: `apps/web/src/features/profile/BasicAttributesCard.tsx`
- Modify: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを追加**

Append new describe block:

```tsx
describe("BasicAttributesCard — Save success", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("[保存] click で PATCH /v1/profiles/me が呼ばれ ViewMode に戻る", async () => {
    const user = userEvent.setup();
    let received: Record<string, unknown> | null = null;
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...FILLED,
          age_group: "40代",
        });
      }),
    );

    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ });
    await user.selectOptions(ageSelect, "40代");

    await user.click(screen.getByRole("button", { name: "保存" }));

    // ViewMode に戻る (= 編集ボタンが再表示される)
    await screen.findByRole("button", { name: "編集" });

    // PATCH payload を検証 (age_group が 40代 で送られた)
    expect(received).toMatchObject({ age_group: "40代" });
    // toast: 保存しました (ToastProvider 経由で role=status / 文字列で確認)
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
  });

  it("空文字フィールドは null に正規化されて送信される", async () => {
    const user = userEvent.setup();
    let received: Record<string, unknown> | null = null;
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(EMPTY);
      }),
    );

    renderCard(EMPTY); // 空 profile から開く
    await user.click(screen.getByRole("button", { name: "編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("button", { name: "編集" });
    expect(received).toMatchObject({
      age_group: null,
      occupation: null,
      life_stage: null,
      value_tags: [],
      gender: [],
    });
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: FAIL — onSave が何もしないため ViewMode に戻らない / PATCH が送られない

- [ ] **Step 3: Save ロジックを実装**

Modify `BasicAttributesCard.tsx` — `BasicAttributesCard` function を以下に置換:

```tsx
export function BasicAttributesCard({ profile }: BasicAttributesCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile));
  const updateProfile = useUpdateProfile();
  const { push } = useToast();

  const startEdit = () => {
    setDraft(toDraft(profile));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync(toPayload(draft));
      push({ message: t("saveSuccess"), variant: "info" });
      setEditing(false);
    } catch (err) {
      push({ message: `${t("saveError")}: ${String(err)}`, variant: "error" });
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif font-semibold">基本属性</h2>
        {!editing && (
          <Button variant="secondary" onClick={startEdit}>
            {t("editButton")}
          </Button>
        )}
      </div>
      {!editing ? (
        <ViewMode profile={profile} />
      ) : (
        <EditMode
          draft={draft}
          setDraft={setDraft}
          onCancel={cancelEdit}
          onSave={handleSave}
          saving={updateProfile.isPending}
        />
      )}
    </Card>
  );
}
```

Add to import at top of file:

```tsx
import { Button, Card, Input, useToast } from "@yesman/ui";
import { useUpdateProfile } from "./useProfile";
```

- [ ] **Step 4: テスト pass を確認**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/profile/BasicAttributesCard.tsx \
        apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): BasicAttributesCard の保存 mutation 成功 path を実装

useUpdateProfile.mutateAsync で PATCH を発火、onSuccess で
ViewMode 復帰 + 保存しました toast。toPayload は空文字を null、
リストは重複排除+空要素除外で正規化。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Save 失敗時のエラーハンドリング (TDD)

**Files:**
- Modify: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを追加**

Append new describe block:

```tsx
describe("BasicAttributesCard — Save failure", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("PATCH が 500 を返したら EditMode は維持され error toast が出る", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", () =>
        new HttpResponse(JSON.stringify({ detail: "internal" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    // toast に "保存に失敗しました" が出る
    expect(await screen.findByText(/保存に失敗しました/)).toBeInTheDocument();
    // EditMode のまま (= [保存] button が再度押せる状態)
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト実行**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (Task 5 の `handleSave` の catch ブロックで既に対応済み)

> 注: もし toast 文字列マッチが厳密で fail する場合、`saveError` の format (`${t("saveError")}: ${String(err)}`) を見直す。

- [ ] **Step 3: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
test(web): BasicAttributesCard の Save 失敗時挙動を検証

500 応答時に EditMode が維持され、error toast が表示されることを確認。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: キャンセル動作 (TDD)

**Files:**
- Modify: `apps/web/tests/features/profile/BasicAttributesCard.test.tsx`

- [ ] **Step 1: 失敗するテストを追加**

Append new describe block:

```tsx
describe("BasicAttributesCard — Cancel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("編集中の変更を [キャンセル] で破棄し ViewMode に戻る", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    // age_group を 40代 に変更
    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ });
    await user.selectOptions(ageSelect, "40代");

    // キャンセル
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    // ViewMode に戻り、元の値 (30代) が表示されている
    expect(await screen.findByRole("button", { name: "編集" })).toBeInTheDocument();
    expect(screen.getByText("30代")).toBeInTheDocument();
    expect(screen.queryByText("40代")).not.toBeInTheDocument();

    // 再度編集を開いた時に draft が profile の現在値で再初期化される
    await user.click(screen.getByRole("button", { name: "編集" }));
    const ageSelect2 = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    expect(ageSelect2.value).toBe("30代");
  });
});
```

- [ ] **Step 2: テスト実行**

Run:
```bash
cd apps/web && pnpm test -- BasicAttributesCard
```
Expected: PASS (Task 3 の `startEdit` が `setDraft(toDraft(profile))` で再初期化するため既に対応済み)

- [ ] **Step 3: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/tests/features/profile/BasicAttributesCard.test.tsx
git commit -m "$(cat <<'EOF'
test(web): BasicAttributesCard の Cancel 挙動を検証

編集中の変更が破棄され、再編集時は profile 現在値で draft が再初期化される
ことを確認。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ProfilePage に組み込み

**Files:**
- Modify: `apps/web/src/features/profile/ProfilePage.tsx`

- [ ] **Step 1: ProfilePage を更新**

Modify `apps/web/src/features/profile/ProfilePage.tsx` — 「基本属性」Card 部分 (line 51-93) を `<BasicAttributesCard />` に置換。

Replace lines 50-93 (`{/* INCEPTION A3 ... */}` から `</Card>` まで) with:

```tsx
      <BasicAttributesCard profile={data ?? undefined} />
```

And add import at top:

```tsx
import { BasicAttributesCard } from "./BasicAttributesCard";
```

Remove unused references to `data` 内部展開がなくなった場合は問題ないが、Email/Sub Card と raw data details はそのまま残す。raw data details は Card の中にあったので、BasicAttributesCard 内には移動しない (Sub/Email Card の方が自然なら spec scope 外なので一旦そのまま)。

実際には「基本属性 Card」内に元々 `<details>raw data</details>` が含まれていた。これは BasicAttributesCard の外、例えば Sub/Email Card の下に独立して移すか、削除するか。設計判断: **raw data details は Card 外に独立移動** (デバッグ用なので)。

具体的な edit instruction:

```tsx
// 旧 line 36-48 (Sub/Email Card): そのまま保持
// 旧 line 50-93 (基本属性 Card): まるごと以下に置換
      <BasicAttributesCard profile={data ?? undefined} />

      {data !== undefined && data !== null && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-neutral-500">
            raw data
          </summary>
          <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
```

最終的な ProfilePage.tsx の body 構造:

```tsx
return (
  <div className="flex flex-col gap-4">
    <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>

    <Card>
      {/* Sub/Email - 既存のまま */}
    </Card>

    <BasicAttributesCard profile={data ?? undefined} />

    {data !== undefined && data !== null && (
      <details className="mt-1">...</details>
    )}

    <Card>
      <h2>🎤 音声入力 backend</h2>
      <VoiceBackendSelector />
    </Card>

    <Card className="border-l-4 border-danger">
      {/* アカウント削除 - 既存のまま */}
    </Card>

    <Modal>...</Modal>
  </div>
);
```

- [ ] **Step 2: TypeScript 型チェック + 既存テスト確認**

Run:
```bash
cd apps/web && pnpm tsc --noEmit && pnpm test
```
Expected: PASS (TS error なし、既存 web tests すべて pass、BasicAttributesCard tests も pass)

- [ ] **Step 3: Lint**

Run:
```bash
cd apps/web && pnpm lint
```
Expected: PASS (warning 0、error 0)

- [ ] **Step 4: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/profile/ProfilePage.tsx
git commit -m "$(cat <<'EOF'
feat(web): ProfilePage の基本属性 Card を BasicAttributesCard に置換

read-only Card だった部分を View ↔ Edit 切替可能な BasicAttributesCard に
リプレース。raw data details は Card 外に独立配置。

Closes: Profile 編集機能 (spec 2026-05-20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: マニュアル動作確認 + 完了 PR

**Files:** なし (verification + PR)

- [ ] **Step 1: dev server を再起動 (既存 background task は古い bundle を持つ可能性あり)**

> 注: dev server は HMR で自動 reload するため、通常再起動は不要。ただし build キャッシュ問題があった場合は restart。

- [ ] **Step 2: ブラウザで /profile を開いて手動検証**

Browser で `http://localhost:5173/profile` を開き、以下を実施:

1. 基本属性 Card に `[編集]` ボタンが表示されている
2. `[編集]` を押すと、年齢層 select / 職業 input / 価値観タグ chip / 性別 chip / ライフステージ select / `[キャンセル]` / `[保存]` が現れる
3. 年齢層 = 30代、職業 = "テスト", 価値観タグ = 効率重視 + ミニマリスト (カスタム), 性別 = 女性, ライフステージ = 社会人 を選択
4. `[保存]` を押す → toast "保存しました" → ViewMode に戻る → 入力した値が表示される
5. ブラウザ reload → 値が保持されている
6. `[編集]` → 値を変更 → `[キャンセル]` → 元の値に戻る
7. raw data details を展開して JSON に反映されていることを確認

`curl -s http://localhost:8000/v1/profiles/me -H "Authorization: Bearer mock-token"` のような API レスポンス確認は MOCK_AUTO_USER=true により Bearer 不要だが、現状の AuthBypass モード下では single user に固定されているので、画面 reload 後の persistence で十分。

- [ ] **Step 3: 全テスト + build 確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm --filter @yesman/web test
pnpm --filter @yesman/web build
pnpm --filter @yesman/web lint
```
Expected: 全 PASS。BasicAttributesCard tests 10 件 + 既存 web tests 全件 pass。

- [ ] **Step 4: 手動検証で確認できた事項を CLAUDE.md / 完了基準にチェック反映**

`docs/superpowers/specs/2026-05-20-profile-edit-design.md` の §13 完了基準のチェックを埋めるかどうかは任意。spec は immutable に扱う場合は変更不要。

- [ ] **Step 5: PR 作成 (user の明示的指示があった場合のみ)**

```bash
git push -u origin feature/profile-edit-ui
gh pr create --title "feat(web): Profile 基本属性のインライン編集 UI を追加" --body "$(cat <<'EOF'
## Summary
- ProfilePage の「基本属性」Card を read-only ↔ Edit 切替可能な `BasicAttributesCard` に置換
- 年齢層 / 職業 / 価値観タグ / 性別 / ライフステージ の 5 フィールドを `PATCH /v1/profiles/me` で更新
- preset 値 (年齢層 7 / ライフステージ 6 / 性別 4 / 価値観タグ 8 件) + 価値観タグのみ自由追加
- 空文字 → null、リスト重複排除の正規化を `toPayload` で集約

## Spec
[docs/superpowers/specs/2026-05-20-profile-edit-design.md](../blob/feature/profile-edit-ui/docs/superpowers/specs/2026-05-20-profile-edit-design.md)

## Test plan
- [ ] `pnpm --filter @yesman/web test` 全件 pass (新規 BasicAttributesCard.test.tsx 10 ケース含む)
- [ ] `pnpm --filter @yesman/web build` 成功
- [ ] `pnpm --filter @yesman/web lint` warn / error 0
- [ ] Mock mode で /profile を手動操作: 編集 → 保存 → toast → reload → 値保持
- [ ] [キャンセル] で変更破棄、再編集時に現在値で再初期化される

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> ⚠️ Push と PR 作成は **user の明示的な指示があった場合のみ** 実行。CLAUDE.md Git-Flow 章の "AI assistant は user が明示的に push を指示した場合のみ push 実行可" に従う。

---

## Self-Review Checklist

(plan 作者: writing-plans skill の self-review として、書き終わった後に確認すべき項目)

**Spec coverage** ✅
- §2 ユーザストーリー Gherkin AC → Tasks 2 (view), 3 (toggle), 5 (save success), 6 (error), 7 (cancel) で全 5 シナリオをカバー
- §3 architecture (BasicAttributesCard + sub components) → Task 3 で実装
- §4 preset 値 → Task 1
- §5 validation (maxLength) → Task 3 で `maxLength` 属性と `disabled` を実装
- §6 toPayload → Task 3 末尾に追加、Task 5 で wire
- §7 error handling (network/422/401) → Task 5 catch + Task 6 test。401 は ApiProvider interceptor 任せ (spec 通り)
- §8 変更ファイル一覧 → File Structure で完全一致
- §9 テスト 8 ケース → Tasks 2-7 で 10 ケースに分割 (元の 8 ケースに加え、payload 正規化 + カスタムタグ Enter 追加)
- §10 out of scope → preferences フィールドは touch しない (Task 3 の toPayload に含めていない) ✓
- §11 Git-Flow → feature/profile-edit-ui 上で作業 ✓
- §13 完了基準 → Task 9 で全項目検証

**Placeholder scan** ✅
- "TBD" / "TODO" なし
- 全 step に具体的なコード / コマンド / 期待出力あり
- Task 4-7 の "PASS (既に対応済み)" は事実 — TDD の特性として後方の機能 test が前 task の実装でカバーされる場合がある

**Type consistency** ✅
- `ProfileDraft` interface は Task 3 で定義、Task 5 の `handleSave` でも同名で参照
- `toPayload(draft: ProfileDraft): ProfileUpdate` の型と signature が一貫
- `BasicAttributesCardProps` は Task 2-3 で同一
- `EditModeProps` の `setDraft` signature (`(updater: (prev) => next) => void`) と Task 3 の `setDraft((d) => ({ ...d, ... }))` が整合

**Concerns / 注意点**
- ChipMultiField の "preset と既存カスタム値 union" 表示は Task 3 で実装、テスト Task 4 で「ミニマリスト」追加 → 表示確認でカバー
- `useToast` の `push({ variant: "info" | "error" })` の API 形状は ProfilePage.tsx 既存実装 (line 26, 28) と同一なので問題なし
- Task 8 で `data ?? undefined` の null/undefined 変換は `useQuery` が初回 fetch 中は `data === undefined` だが、API レスポンスが null になる経路は API 実装上ない (空 Profile を auto-create する設計)。

---
