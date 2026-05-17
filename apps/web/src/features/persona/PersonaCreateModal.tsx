/**
 * PersonaCreateModal — 新規 Persona 作成 (U7d FD §4.2 + ultrathink I2: rejected detail Toast).
 */
import { useState } from "react";
import { Button, Input, Modal, useToast } from "@yesman/ui";
import { ApiError } from "@yesman/api-client";
import { useCreatePersona } from "./usePersona";
import { t } from "./strings";

export interface PersonaCreateModalProps {
  open: boolean;
  onClose: () => void;
}

export function PersonaCreateModal({ open, onClose }: PersonaCreateModalProps) {
  const create = useCreatePersona();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        name,
        description: description || null,
        prompt_text: promptText,
        avatar_url: avatarUrl || null,
      });
      push({ message: t("createSuccess"), variant: "success" });
      setName("");
      setDescription("");
      setPromptText("");
      setAvatarUrl("");
      onClose();
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
    <Modal open={open} onClose={onClose} title={t("modalTitle")}>
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          {t("fieldName")}
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </label>
        <label className="text-sm">
          {t("fieldDescription")}
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="text-sm">
          {t("fieldPrompt")}
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            minLength={30}
            maxLength={2000}
            className="block w-full rounded-xl border border-neutral-300 bg-neutral-0 dark:bg-neutral-800 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 whitespace-pre-wrap"
            rows={6}
          />
        </label>
        <label className="text-sm">
          {t("fieldAvatarUrl")}
          <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
        </label>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("cancelButton")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name || promptText.length < 30}
            loading={create.isPending}
          >
            {t("saveButton")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
