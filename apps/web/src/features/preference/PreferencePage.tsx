/**
 * PreferencePage — PreferenceProfile 表示 + DELETE (U7d FD §6).
 *
 * 2026-05-24: 傾向表示は PreferenceTrends に分離 (ScorePage と共有).
 *   このページは page-level chrome (タイトル + reset button + modal) のみ担当.
 */
import { useState } from "react";
import { Button, Modal, useToast } from "@yesman/ui";
import { useResetPreference } from "./usePreference";
import { PreferenceTrends } from "./PreferenceTrends";
import { t } from "./strings";

export default function PreferencePage() {
  const reset = useResetPreference();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  const handleReset = async () => {
    try {
      await reset.mutateAsync();
      push({ message: t("resetSuccess"), variant: "success" });
      setModalOpen(false);
    } catch (err) {
      push({ message: String(err), variant: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-lg font-bold">{t("pageTitle")}</h1>
        <Button variant="danger" size="sm" onClick={() => setModalOpen(true)}>
          {t("resetButton")}
        </Button>
      </div>

      <PreferenceTrends density="full" />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("resetButton")}
      >
        <p className="text-neutral-700 mb-3">{t("resetConfirm")}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleReset}
            loading={reset.isPending}
          >
            {t("resetButton")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
