/**
 * SplashPage — mockup §1 通り (2026-05-24 visual overhaul).
 *
 * mockup §1 構成:
 *   - 上下中央配置
 *   - 3 blob (orange / green / blue) 横並び (size 44 + 2 eyes)
 *   - YesMan italic serif title (大、Crimson Pro)
 *   - 「人間最後の仕事は、YES で承認すること。」 italic serif tagline
 *   - 黒楕円 button「はじめる」 (cream-lt text、Crimson Pro italic)
 *   - 「すでにアカウントがある方は ログイン」 link
 *   - 画面下部に地球地平線 (緑 / オレンジ / 青の半円 3 つが重なる)
 */
import { useLocation, useNavigate } from "react-router-dom";
import { BlobAvatar } from "@yesman/ui";

const MK_CREAM = "#F2EEE2";
const MK_CREAM_LT = "#FFFCF4";
const MK_UMBER = "#2E2418";
const MK_MUTED = "rgba(46, 36, 24, 0.55)";

export default function SplashPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  const goToSignIn = () => {
    navigate("/auth/signin", {
      state: { from: { pathname: from } },
      replace: false,
    });
  };

  return (
    // 2026-05-24: SplashPage は Layout 外の独立 route (routes.tsx 参照).
    //   画面全体に background (cream + earth horizon) を full-bleed で表示.
    //   min-h-screen で viewport を完全に占有、scroll 不要 (compact content).
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-4 relative overflow-hidden"
      style={{ background: MK_CREAM, color: MK_UMBER }}
    >
      {/* 地球地平線 (画面下、3 色半円が重なる) */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-48 pointer-events-none">
        <div
          style={{
            position: "absolute",
            bottom: -120,
            left: -60,
            right: -60,
            height: 220,
            background: "#21A48F",
            opacity: 0.3,
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -90,
            left: -80,
            right: "38%",
            height: 160,
            background: "#EF7A62",
            opacity: 0.34,
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -110,
            left: "30%",
            right: -90,
            height: 150,
            background: "#8AB2DF",
            opacity: 0.32,
            borderRadius: "50% 65% 50% 55%",
          }}
        />
      </div>

      {/* Body (z-10 で 地球より前) */}
      <div className="relative z-10 w-full max-w-md text-center flex flex-col items-center">
        {/* 3 blob (orange / green / blue) */}
        <div className="flex items-end gap-3 mb-4">
          <BlobAvatar size={36} color="orange" gaze="upright" name="" />
          <BlobAvatar size={36} color="green" gaze="downleft" name="" />
          <BlobAvatar size={36} color="blue" gaze="center" name="" />
        </div>

        <h1
          className="text-3xl font-medium mb-2"
          style={{
            fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
            fontStyle: "italic",
            letterSpacing: "0.02em",
            color: MK_UMBER,
          }}
        >
          YesMan
        </h1>

        <p
          className="text-xs leading-relaxed mb-4"
          style={{
            fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
            fontStyle: "italic",
            color: MK_UMBER,
            opacity: 0.75,
          }}
        >
          人間最後の仕事は、
          <br />
          YES で承認すること。
        </p>

        {/* 黒楕円 「はじめる」 CTA */}
        <button
          type="button"
          onClick={goToSignIn}
          className="w-[78%] rounded-full py-2.5 transition-opacity hover:opacity-90 active:opacity-80"
          style={{
            background: MK_UMBER,
            color: MK_CREAM,
            fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
            fontStyle: "italic",
            fontSize: 13,
            letterSpacing: "0.05em",
            fontWeight: 500,
          }}
          data-testid="splash-start"
        >
          はじめる
        </button>

        <p
          className="mt-2 text-[10px]"
          style={{
            fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
            fontStyle: "italic",
            color: MK_MUTED,
          }}
        >
          すでにアカウントがある方は{" "}
          <button
            type="button"
            onClick={goToSignIn}
            className="underline underline-offset-2 hover:no-underline"
            style={{ color: MK_UMBER }}
            data-testid="splash-login"
          >
            ログイン
          </button>
        </p>
      </div>
    </main>
  );
}

// keep export for vite chunking compatibility with previous code
export const __SplashCardBg = MK_CREAM_LT;
