/**
 * BasicAttributesCard — Profile 基本属性の View ↔ Edit Card.
 *
 * spec: docs/superpowers/specs/2026-05-20-profile-edit-design.md
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { Button, Card, Input, useToast } from "@yesman/ui";
import type { Profile, ProfileUpdate } from "@yesman/api-client";
import { t } from "./strings";
import { useUpdateProfile } from "./useProfile";
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

export interface ProfileDraft {
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
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
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
        label={t("fieldGender")}
        presets={GENDER_PRESETS}
        allowCustom={false}
        singleSelect
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
  /** true なら chip クリックで他の選択を解除して単一選択 (再クリックで解除) */
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

export function toPayload(draft: ProfileDraft): ProfileUpdate {
  return {
    age_group: draft.age_group.trim() || null,
    occupation: draft.occupation.trim() || null,
    value_tags: Array.from(new Set(draft.value_tags.map((v) => v.trim()).filter(Boolean))),
    gender: Array.from(new Set(draft.gender.map((v) => v.trim()).filter(Boolean))),
    life_stage: draft.life_stage.trim() || null,
  };
}
