/**
 * PersonaCreateModal — 新規 Persona 作成 (U7d FD §4.2 + ultrathink I2: rejected detail Toast).
 *
 * 2026-05-26: Modal を size="full" に拡大 + ProfilePage の AvatarEditor を embed.
 *   - 名前 / 説明 / プロンプト指示文 + アバター (色 / 絵文字 / 頭文字 / image URL).
 *   - AvatarEditor の AvatarConfig (color/emoji/image_url) は local draft state、
 *     image_url があれば avatar_url field に、それ以外は cfg JSON にエンコードして
 *     avatar_url に詰める ("yesman-avatar:" prefix + base64).
 */
import { useMemo, useState } from "react";
import { Button, Input, Modal, useToast } from "@yesman/ui";
import { ApiError } from "@yesman/api-client";
import { useCreatePersona } from "./usePersona";
import { t } from "./strings";
import { AvatarEditor } from "../profile/AvatarEditor";
import type { AvatarConfig } from "../profile/Avatar";

const DEFAULT_AVATAR_CONFIG: AvatarConfig = { mode: "default" };

/** AvatarConfig を avatar_url field 用にエンコード (image_url 優先、なければ cfg JSON). */
function encodeAvatarForUrl(cfg: AvatarConfig): string | null {
  if (cfg.mode === "image" && cfg.image_url) {
    return cfg.image_url;
  }
  if (cfg.mode === "default") {
    return null;
  }
  // color / emoji の config を base64 JSON で詰める. 表示側で先頭 prefix を見て parse 可能.
  const payload = JSON.stringify({
    mode: cfg.mode,
    color: cfg.color ?? null,
    emoji: cfg.emoji ?? null,
  });
  // btoa は Unicode を直接扱えないため encodeURIComponent → unescape を経由
  const b64 = btoa(unescape(encodeURIComponent(payload)));
  return `yesman-avatar:${b64}`;
}

export interface PersonaCreateModalProps {
  open: boolean;
  onClose: () => void;
  /** 作成成功時 callback (例: 作成直後に my タブへ切替). */
  onCreated?: () => void;
}

export function PersonaCreateModal({
  open,
  onClose,
  onCreated,
}: PersonaCreateModalProps) {
  const create = useCreatePersona();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [avatarUrlOverride, setAvatarUrlOverride] = useState("");

  // 頭文字 fallback は name の 1 文字目 (空なら "P").
  const fallbackLetter = useMemo(() => {
    const c = name.trim().slice(0, 1);
    return c.length > 0 ? c : "P";
  }, [name]);

  const handleSubmit = async () => {
    // avatar_url の決定: image URL の直接入力があれば最優先、なければ AvatarConfig エンコード.
    const avatar_url =
      avatarUrlOverride.trim() !== ""
        ? avatarUrlOverride.trim()
        : encodeAvatarForUrl(avatarConfig);
    try {
      await create.mutateAsync({
        name,
        description: description || null,
        prompt_text: promptText,
        avatar_url,
      });
      push({ message: t("createSuccess"), variant: "success" });
      setName("");
      setDescription("");
      setPromptText("");
      setAvatarConfig(DEFAULT_AVATAR_CONFIG);
      setAvatarUrlOverride("");
      onClose();
      onCreated?.();
    } catch (err) {
      if (err instanceof ApiError && err.is("rejected_by_moderator")) {
        // ultrathink U7d FD I2: server 由来 detail.message を Toast
        const detail = err.detail as { reason: string; message?: string } | null;
        push({
          message: detail?.message ?? t("rejectedDefault"),
          variant: "error",
        });
      } else {
        push({ message: String(err), variant: "error" });
      }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("modalTitle")} size="full">
      <div className="flex flex-col gap-4">
        {/* 1. 名前 */}
        <label className="text-sm">
          <span className="block mb-1 font-semibold">{t("fieldName")}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </label>

        {/* 2. アバター: 色 / 絵文字 / 頭文字 を AvatarEditor で選択 */}
        <fieldset
          className="rounded-xl border border-neutral-200 p-3"
          style={{ borderColor: "#E0D5BC" }}
          data-testid="persona-create-avatar-section"
        >
          <legend className="px-2 text-sm font-semibold">アバター</legend>
          <AvatarEditor
            value={avatarConfig}
            onChange={setAvatarConfig}
            fallbackLetter={fallbackLetter}
          />
          {/* 画像 URL 直接入力 (任意 / advanced) */}
          <details className="text-xs mt-3">
            <summary className="cursor-pointer text-neutral-600 hover:text-neutral-800">
              画像 URL を直接指定する (任意 / 上記設定より優先)
            </summary>
            <div className="mt-2">
              <Input
                value={avatarUrlOverride}
                onChange={(e) => setAvatarUrlOverride(e.target.value)}
                placeholder="https://..."
                maxLength={500}
              />
            </div>
          </details>
        </fieldset>

        {/* 3. 説明 */}
        <label className="text-sm">
          <span className="block mb-1 font-semibold">{t("fieldDescription")}</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </label>

        {/* 4. プロンプト指示文 */}
        <label className="text-sm">
          <span className="block mb-1 font-semibold">{t("fieldPrompt")}</span>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            minLength={10}
            maxLength={2000}
            className="block w-full rounded-xl border border-neutral-300 bg-neutral-0 dark:bg-neutral-800 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 whitespace-pre-wrap"
            rows={6}
          />
          <span
            className={`block mt-1 text-[10px] ${
              promptText.length >= 10 ? "text-neutral-500" : "text-orange-600"
            }`}
          >
            10 字以上 (現在 {promptText.length} 字
            {promptText.length < 10 ? ` / あと ${10 - promptText.length} 字` : " ✓"})
          </span>
        </label>

        {/* アクション */}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("cancelButton")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name || promptText.length < 10}
            loading={create.isPending}
          >
            {t("saveButton")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
