/**
 * ProfilePage — U7d 本実装 (placeholder 置換).
 *
 * ultrathink U7d FD Imp3: 二段階削除確認 (Modal + checkbox + final button).
 */
import { useState } from "react";
import { Button, Card, Modal, Spinner, useToast } from "@yesman/ui";
import { useProfile, useDeleteProfile } from "./useProfile";
import { useAuth } from "../../shell/AuthProvider";
import { signOutUser } from "../../shell/auth";
import { useVoiceBackend, type VoiceUserBackend } from "../voice/useVoiceBackend";
import { t } from "./strings";

export default function ProfilePage() {
  const { sub, email } = useAuth();
  const { data, isPending } = useProfile();
  const deleteMe = useDeleteProfile();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMe.mutateAsync();
      push({ message: t("deleteSuccess"), variant: "info" });
      await signOutUser();
    } catch (err) {
      push({ message: String(err), variant: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>

      <Card>
        <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
          <dt className="font-semibold">{t("fieldSub")}:</dt>
          <dd className="font-mono break-all">{sub ?? "-"}</dd>
          <dt className="font-semibold">{t("fieldEmail")}:</dt>
          <dd>{email ?? "-"}</dd>
        </dl>
        {isPending && (
          <div className="mt-3">
            <Spinner size="sm" />
          </div>
        )}
      </Card>

      {/* INCEPTION A3 プロフィール初期入力: 年齢層 / 職業 / 価値観タグ / 性別 / ライフステージ */}
      <Card>
        <h2 className="font-serif font-semibold mb-3">基本属性</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
          <dt className="font-semibold">{t("fieldAgeGroup")}:</dt>
          <dd className="text-neutral-700">
            {data && "age_group" in data && data.age_group
              ? String(data.age_group)
              : <span className="italic text-neutral-400">{t("ageGroupPlaceholder")}</span>}
          </dd>
          <dt className="font-semibold">{t("fieldOccupation")}:</dt>
          <dd className="text-neutral-700">
            {data && "occupation" in data && data.occupation
              ? String(data.occupation)
              : <span className="italic text-neutral-400">未設定</span>}
          </dd>
          <dt className="font-semibold">{t("fieldValueTags")}:</dt>
          <dd className="text-neutral-700">
            {data && "value_tags" in data && Array.isArray(data.value_tags) && data.value_tags.length > 0
              ? (data.value_tags as string[]).join(" / ")
              : <span className="italic text-neutral-400">{t("valueTagsPlaceholder")}</span>}
          </dd>
          <dt className="font-semibold">{t("fieldGender")}:</dt>
          <dd className="text-neutral-700">
            {data && "gender" in data && Array.isArray(data.gender) && data.gender.length > 0
              ? (data.gender as string[]).join(" / ")
              : <span className="italic text-neutral-400">未設定</span>}
          </dd>
          <dt className="font-semibold">{t("fieldLifeStage")}:</dt>
          <dd className="text-neutral-700">
            {data && "life_stage" in data && data.life_stage
              ? String(data.life_stage)
              : <span className="italic text-neutral-400">未設定</span>}
          </dd>
        </dl>
        {data !== undefined && data !== null && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-500">
              raw data
            </summary>
            <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
          </details>
        )}
      </Card>

      {/* 音声入力 backend 切替 (A: Web Speech API / B: Server STT) */}
      <Card>
        <h2 className="font-serif font-semibold mb-3">🎤 音声入力 backend</h2>
        <VoiceBackendSelector />
      </Card>

      <Card className="border-l-4 border-danger">
        <h2 className="font-serif font-semibold mb-3">{t("deleteSectionTitle")}</h2>
        <Button variant="danger" onClick={() => setModalOpen(true)}>
          {t("deleteButton")}
        </Button>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setConfirmed(false);
        }}
        title={t("deleteModalTitle")}
      >
        <p className="text-neutral-700 dark:text-neutral-200 mb-3">
          {t("deleteWarning")}
          <strong className="text-danger ml-1">{t("deleteUnrecoverable")}</strong>
        </p>
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="text-sm">{t("deleteConfirmLabel")}</span>
        </label>
        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setModalOpen(false);
              setConfirmed(false);
            }}
          >
            {t("cancelButton")}
          </Button>
          <Button
            variant="danger"
            disabled={!confirmed}
            loading={deleteMe.isPending}
            onClick={handleDelete}
          >
            {t("deleteFinalButton")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** 音声入力 backend 選択 UI: A) Web Speech API / B) Server STT のラジオ + 説明. */
function VoiceBackendSelector() {
  const { backend, setBackend, webSpeechSupported } = useVoiceBackend();

  const onChange = (value: VoiceUserBackend) => setBackend(value);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name="voice-backend"
          value="web-speech-api"
          checked={backend === "web-speech-api"}
          onChange={() => onChange("web-speech-api")}
          disabled={!webSpeechSupported}
          className="mt-1"
        />
        <span>
          <span className="font-semibold">
            A) Web Speech API <span className="text-neutral-500">(ブラウザ内蔵)</span>
          </span>
          <span className="block text-xs text-neutral-600 mt-0.5">
            オフラインで日本語音声を即時テキスト化。サーバ STT を呼ばない。
            {!webSpeechSupported && (
              <span className="block text-danger italic mt-0.5">
                ⚠ お使いのブラウザは非対応です (Chrome / Edge / Safari 14.1+ をお試しください)
              </span>
            )}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name="voice-backend"
          value="server"
          checked={backend === "server"}
          onChange={() => onChange("server")}
          className="mt-1"
        />
        <span>
          <span className="font-semibold">
            B) Server STT <span className="text-neutral-500">(AWS Transcribe / Mock)</span>
          </span>
          <span className="block text-xs text-neutral-600 mt-0.5">
            MediaRecorder で録音 → POST /v1/voice/stt。VOICE_BACKEND env で
            aws / mock を切替。現状 mock の場合は <code>[mock-stt-xxxx]</code> 固定文字列が返る。
          </span>
        </span>
      </label>

      <p className="text-xs italic text-neutral-500 mt-1">
        変更は localStorage に保存され、次回以降の音声入力に反映されます。
      </p>
    </div>
  );
}
