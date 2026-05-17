/**
 * PreferencePage — PreferenceProfile 表示 + DELETE (U7d FD §6).
 */
import { useState } from "react";
import { Button, Card, Modal, Spinner, useToast } from "@yesman/ui";
import { usePreference, useResetPreference } from "./usePreference";
import { t } from "./strings";

export default function PreferencePage() {
  const { data, isPending } = usePreference();
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

  if (isPending) return <Spinner />;
  if (!data) return <p className="text-neutral-500">{t("empty")}</p>;

  // PreferenceProfile は `any` 型のため部分的に access
  const profile = data as {
    accepted_patterns?: string[];
    rejected_patterns?: string[];
    persona_style_preference?: Record<string, number>;
    inferred_tags?: string[];
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>
        <Button variant="danger" size="sm" onClick={() => setModalOpen(true)}>
          {t("resetButton")}
        </Button>
      </div>

      <Card>
        <h2 className="font-semibold mb-2">{t("labelAccepted")}</h2>
        <ul className="text-sm list-disc pl-5">
          {(profile.accepted_patterns ?? []).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">{t("labelRejected")}</h2>
        <ul className="text-sm list-disc pl-5">
          {(profile.rejected_patterns ?? []).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">{t("labelPersonaStyle")}</h2>
        <dl className="text-sm grid grid-cols-[8rem_1fr] gap-2">
          {Object.entries(profile.persona_style_preference ?? {}).map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd className="font-mono">{v.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("resetButton")}>
        <p className="text-neutral-700 mb-3">{t("resetConfirm")}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleReset} loading={reset.isPending}>
            {t("resetButton")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
