/**
 * ProfileCard — 2026-05-24: 統合 Profile Card (旧 ProfileSummaryCard + BasicAttributesCard 統合).
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ [Y] yuki_morimatsu7         [編集]  │  ← header (avatar + name + stat)
 *   │     決定 N 回 / Yes 採択 N 回         │
 *   │ ─────────────────────────────────── │
 *   │ ★ 価値観タグ                          │  ← chip 一覧 (view-only、編集は edit mode で)
 *   │   [効率重視] [慎重] [楽観]            │
 *   │ ─────────────────────────────────── │
 *   │ 年齢層:        30 代               │  ← その他属性 (display_name/value_tags は header/上に既出)
 *   │ 職業:         未設定               │
 *   │ 性別:         未設定               │
 *   │ ライフステージ: 未設定              │
 *   └─────────────────────────────────────┘
 *
 * 編集時: 全 field (display_name + age_group + occupation + value_tags + gender + life_stage) を form で編集.
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { Button, Card, Input, useToast } from "@yesman/ui";
import type { Profile, ProfileUpdate } from "@yesman/api-client";
import { useScore } from "../score/useScore";
import { usePreference } from "../preference/usePreference";
import { useAuth } from "../../shell/AuthProvider";
import { env } from "../../shell/env";
import { setDisplayName as setMockDisplayName } from "../../shell/mockAuthStorage";
import { useProfile, useUpdateProfile } from "./useProfile";
import { t } from "./strings";
import {
  AGE_GROUP_PRESETS,
  GENDER_PRESETS,
  LIFE_STAGE_PRESETS,
  PROFILE_LIMITS,
  VALUE_TAG_PRESETS,
} from "./presets";
import { Avatar, type AvatarConfig } from "./Avatar";
import { AvatarEditor } from "./AvatarEditor";

const MK_UMBER = "#2E2418";
const MK_ORANGE = "#EF7A62";
const MK_HAIRLINE_2 = "rgba(46, 36, 24, 0.18)";

interface ProfileDraft {
  display_name: string;
  age_group: string;
  occupation: string;
  value_tags: string[];
  gender: string[];
  life_stage: string;
  avatar_config: AvatarConfig;
}

const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  mode: "default",
  color: "green",
  emoji: null,
  image_url: null,
};

function toDraft(
  profile: (Profile & { avatar_config?: AvatarConfig | null }) | undefined,
  display_name: string | null,
): ProfileDraft {
  return {
    display_name: display_name ?? "",
    age_group: profile?.age_group ?? "",
    occupation: profile?.occupation ?? "",
    value_tags: profile?.value_tags ?? [],
    gender: profile?.gender ?? [],
    life_stage: profile?.life_stage ?? "",
    avatar_config: profile?.avatar_config ?? DEFAULT_AVATAR_CONFIG,
  };
}

export function toPayload(draft: ProfileDraft): ProfileUpdate & { avatar_config?: AvatarConfig } {
  return {
    age_group: draft.age_group.trim() || null,
    occupation: draft.occupation.trim() || null,
    value_tags: Array.from(new Set(draft.value_tags.map((v) => v.trim()).filter(Boolean))),
    gender: Array.from(new Set(draft.gender.map((v) => v.trim()).filter(Boolean))),
    life_stage: draft.life_stage.trim() || null,
    avatar_config: draft.avatar_config,
  };
}

function deriveDisplayName(
  profile: Profile | undefined,
  authDisplayName: string | null,
  email: string | null,
): string {
  if (authDisplayName && authDisplayName.trim()) return authDisplayName;
  if (profile?.display_name && profile.display_name.trim()) return profile.display_name;
  if (email) return email.split("@")[0] ?? "あなた";
  return "あなた";
}

function deriveInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "Y";
}

function deriveValueTags(
  profile: Profile | undefined,
  preference: { inferred_tags?: unknown[] } | null | undefined,
  max = 5,
): string[] {
  const fromProfile = profile?.value_tags ?? [];
  if (fromProfile.length > 0) return fromProfile.slice(0, max);
  const inferred = (preference?.inferred_tags ?? []) as unknown[];
  return inferred
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, max);
}

export function ProfileCard() {
  const { display_name: authDisplayName, email, refresh } = useAuth();
  const { data: profile } = useProfile();
  const { data: score } = useScore();
  const { data: preference } = usePreference();
  const updateProfile = useUpdateProfile();
  const { push } = useToast();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    toDraft(profile, authDisplayName),
  );

  const displayName = deriveDisplayName(profile, authDisplayName, email);
  const initial = deriveInitial(displayName);
  // saved avatar (view mode 用) — profile から読み込み、未設定なら DEFAULT
  const savedAvatar: AvatarConfig =
    (profile as (Profile & { avatar_config?: AvatarConfig | null }) | undefined)
      ?.avatar_config ?? DEFAULT_AVATAR_CONFIG;
  const total = score?.total ?? 0;
  const noCount = score?.no_count ?? 0;
  const yesCount = total - noCount;
  const tags = deriveValueTags(profile, preference as { inferred_tags?: unknown[] });

  const startEdit = () => {
    setDraft(toDraft(profile, authDisplayName));
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    try {
      if (env.authBypass && email && draft.display_name !== (authDisplayName ?? "")) {
        setMockDisplayName(email, draft.display_name);
        await refresh();
      }
      await updateProfile.mutateAsync(toPayload(draft));
      push({ message: t("saveSuccess"), variant: "info" });
      setEditing(false);
    } catch (err) {
      push({ message: `${t("saveError")}: ${String(err)}`, variant: "error" });
    }
  };

  return (
    <Card data-testid="profile-card" className="!p-4">
      {/* Header: avatar + display_name + stat + 編集 button */}
      <div
        className="flex items-center gap-3 pb-3"
        style={{ borderBottom: `0.5px solid ${MK_HAIRLINE_2}` }}
      >
        <Avatar
          size={60}
          config={editing ? draft.avatar_config : savedAvatar}
          fallbackLetter={initial}
        />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span
            data-testid="profile-card-name"
            className="truncate"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 600,
              color: MK_UMBER,
            }}
          >
            {displayName}
          </span>
          <span
            className="text-[12px] tracking-wide"
            style={{ color: "rgba(46, 36, 24, 0.55)" }}
            data-testid="profile-card-stat"
          >
            決定 {total} 回 / Yes 採択 {yesCount} 回
          </span>
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            {t("editButton")}
          </Button>
        )}
      </div>

      {!editing ? (
        <ViewMode profile={profile} tags={tags} />
      ) : (
        <EditMode
          draft={draft}
          setDraft={setDraft}
          onCancel={cancelEdit}
          onSave={handleSave}
          saving={updateProfile.isPending}
          allowDisplayName={env.authBypass}
          fallbackLetter={initial}
        />
      )}
    </Card>
  );
}

function ViewMode({
  profile,
  tags,
}: {
  profile: Profile | undefined;
  tags: string[];
}) {
  return (
    <>
      {/* 価値観タグ section (accent orange) */}
      <section
        aria-labelledby="profile-card-tags-heading"
        className="flex flex-col gap-2 pt-3"
      >
        <h2
          id="profile-card-tags-heading"
          className="text-[12px] font-bold uppercase tracking-widest"
          style={{ color: MK_ORANGE }}
        >
          価値観タグ
        </h2>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span
              className="text-xs"
              style={{ color: "rgba(46,36,24,0.45)" }}
            >
              (まだ ありません)
            </span>
          ) : (
            tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-3 py-1 text-xs"
                style={{
                  background: "rgba(239, 122, 98, 0.12)",
                  color: MK_UMBER,
                  border: "0.5px solid rgba(239, 122, 98, 0.3)",
                  fontFamily: "var(--font-sans)",
                }}
                data-testid="profile-card-tag"
              >
                {tag}
              </span>
            ))
          )}
        </div>
      </section>

      {/* その他属性 list (display_name は header に既出、value_tags は上に既出) */}
      <dl
        className="grid grid-cols-[8rem_1fr] gap-y-1.5 gap-x-2 text-sm pt-3 mt-3"
        style={{ borderTop: `0.5px solid ${MK_HAIRLINE_2}` }}
      >
        <dt className="font-semibold">{t("fieldAgeGroup")}:</dt>
        <dd className="text-neutral-700">
          {profile?.age_group ? (
            String(profile.age_group)
          ) : (
            <span className="text-neutral-400">{t("ageGroupPlaceholder")}</span>
          )}
        </dd>
        <dt className="font-semibold">{t("fieldOccupation")}:</dt>
        <dd className="text-neutral-700">
          {profile?.occupation ? (
            String(profile.occupation)
          ) : (
            <span className="text-neutral-400">未設定</span>
          )}
        </dd>
        <dt className="font-semibold">{t("fieldGender")}:</dt>
        <dd className="text-neutral-700">
          {profile?.gender && profile.gender.length > 0 ? (
            profile.gender.join(" / ")
          ) : (
            <span className="text-neutral-400">未設定</span>
          )}
        </dd>
        <dt className="font-semibold">{t("fieldLifeStage")}:</dt>
        <dd className="text-neutral-700">
          {profile?.life_stage ? (
            String(profile.life_stage)
          ) : (
            <span className="text-neutral-400">未設定</span>
          )}
        </dd>
      </dl>
    </>
  );
}

interface EditModeProps {
  draft: ProfileDraft;
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  allowDisplayName: boolean;
  fallbackLetter: string;
}

function EditMode({
  draft,
  setDraft,
  onCancel,
  onSave,
  saving,
  allowDisplayName,
  fallbackLetter,
}: EditModeProps) {
  return (
    <form
      className="flex flex-col gap-3 text-sm pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      {/* 2026-05-24: avatar customization */}
      <div
        className="pb-3"
        style={{ borderBottom: `0.5px solid ${MK_HAIRLINE_2}` }}
      >
        <p className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: MK_ORANGE }}>
          アバター
        </p>
        <AvatarEditor
          value={draft.avatar_config}
          onChange={(next) => setDraft((d) => ({ ...d, avatar_config: next }))}
          fallbackLetter={fallbackLetter}
        />
      </div>

      {allowDisplayName && (
        <label className="grid grid-cols-[8rem_1fr] items-center gap-2">
          <span className="font-semibold">{t("fieldDisplayName")}:</span>
          <Input
            aria-label={t("fieldDisplayName")}
            type="text"
            placeholder={t("displayNamePlaceholder")}
            maxLength={PROFILE_LIMITS.DISPLAY_NAME_MAX_LENGTH}
            value={draft.display_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, display_name: e.target.value }))
            }
          />
        </label>
      )}

      <label className="grid grid-cols-[8rem_1fr] items-center gap-2">
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

      <label className="grid grid-cols-[8rem_1fr] items-center gap-2">
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
        label={t("fieldGender")}
        presets={GENDER_PRESETS}
        allowCustom={false}
        singleSelect
        maxCount={PROFILE_LIMITS.GENDER_MAX_COUNT}
        values={draft.gender}
        onChange={(vs) => setDraft((d) => ({ ...d, gender: vs }))}
      />

      <label className="grid grid-cols-[8rem_1fr] items-center gap-2">
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
  singleSelect?: boolean;
}

function ChipMultiField({
  label,
  presets,
  allowCustom,
  maxCount,
  values,
  onChange,
  singleSelect = false,
}: ChipMultiFieldProps) {
  const [customInput, setCustomInput] = useState("");
  const full = values.length >= maxCount;

  const toggle = (v: string) => {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else if (singleSelect) {
      onChange([v]);
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

  const allChips = Array.from(new Set([...presets, ...values]));

  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-2">
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
          <p className="text-xs text-neutral-500">{t("tagsFullNotice")}</p>
        )}
      </div>
    </div>
  );
}
