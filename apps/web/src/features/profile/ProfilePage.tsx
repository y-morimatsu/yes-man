/**
 * ProfilePage — U7d 本実装 (placeholder 置換).
 *
 * ultrathink U7d FD Imp3: 二段階削除確認 (Modal + checkbox + final button).
 */
import { useState, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Modal, useToast } from "@yesman/ui";
import { useDeleteProfile } from "./useProfile";
import { useAuth } from "../../shell/AuthProvider";
import { signOutUser } from "../../shell/auth";
import { useVoiceBackend, type VoiceUserBackend } from "../voice/useVoiceBackend";
import { t } from "./strings";
// v3-γ Task 7: anonymous-strangers opt-in toggle + preview + guard
import { OptInCard } from "./OptInCard";
// 2026-05-24 v2: 統合 ProfileCard (旧 ProfileSummaryCard + BasicAttributesCard).
import { ProfileCard } from "./ProfileCard";

export default function ProfilePage() {
  const { sub, email, refresh } = useAuth();
  const navigate = useNavigate();
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

  // refresh 前に splash へ明示 navigate することで RequireAuth の state.from 自動埋めを回避.
  // (state.from が立つと再 sign in 後 /profile に戻されてしまう)
  //
  // 2026-05-27: navigate 直後の refresh が SplashPage (lazy) の Suspense hydration
  // と競合して React #426 を起こすため、refresh を startTransition でラップ.
  // 非緊急 update として scheduled され、suspense 解決後に適用される.
  const handleSignOut = async () => {
    try {
      await signOutUser();
      navigate("/auth/splash", { replace: true });
      startTransition(() => {
        void refresh();
      });
    } catch (err) {
      push({ message: `ログアウトに失敗しました: ${String(err)}`, variant: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1
        className="text-lg font-bold"
        style={{
          fontFamily: "var(--font-sans)",
          color: "#2E2418",
        }}
      >
        あなたのプロフィール
      </h1>

      {/* 2026-05-24 v2: 統合 Profile Card (avatar + name + stat + 価値観タグ + 基本属性 + 編集). */}
      <ProfileCard />

      {/* v3-γ Task 7: 世界の誰か opt-in card (preview + guard + 「今日 N 件」) */}
      <OptInCard />

      {/* email / sub の technical info (運用上必要、折りたたみ風に薄表示) */}
      <details className="text-xs">
        <summary
          className="cursor-pointer"
          style={{ color: "rgba(46,36,24,0.55)" }}
        >
          アカウント情報
        </summary>
        <Card>
          <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
            <dt className="font-semibold">{t("fieldEmail")}:</dt>
            <dd>{email ?? "-"}</dd>
            <dt className="font-semibold">{t("fieldSub")}:</dt>
            <dd className="font-mono break-all text-xs text-neutral-600">{sub ?? "-"}</dd>
          </dl>
        </Card>
      </details>

      {/* 音声入力 backend 切替 (A: Web Speech API / B: Server STT) */}
      <Card>
        <h2 className="font-sans font-semibold mb-3">🎤 音声入力 backend</h2>
        <VoiceBackendSelector />
      </Card>

      {/* 2026-05-26: Layout header から移管した sign out. */}
      <Card>
        <h2 className="font-sans font-semibold mb-3">ログアウト</h2>
        <Button variant="secondary" onClick={handleSignOut} data-testid="profile-sign-out">
          ログアウト
        </Button>
      </Card>

      <Card className="border-l-4 border-danger">
        <h2 className="font-sans font-semibold mb-3">{t("deleteSectionTitle")}</h2>
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
              <span className="block text-danger mt-0.5">
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

      <p className="text-xs text-neutral-500 mt-1">
        変更は localStorage に保存され、次回以降の音声入力に反映されます。
      </p>
    </div>
  );
}
