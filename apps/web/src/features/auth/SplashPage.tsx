/**
 * SplashPage — 未認証時の hero / ブランド導入画面.
 *
 * spec: docs/superpowers/specs/2026-05-21-splash-signin-design.md
 * - 🪞 emoji + YESMAN wordmark + tagline + disclaimer + coral CTA + secondary link
 * - staged fade-in アニメーション (合計 ~2.1 秒、prefers-reduced-motion 対応は CSS 側)
 * - CTA / secondary link 両方で /auth/signin に navigate、location.state.from を引き継ぐ
 */
import { useLocation, useNavigate } from "react-router-dom";

export default function SplashPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  const goToSignIn = () => {
    // replace: false で Back ボタンで Splash に戻れるようにする (spec §4.3 UX 配慮)
    navigate("/auth/signin", {
      state: { from: { pathname: from } },
      replace: false,
    });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div
          className="text-6xl leading-none select-none splash-fade-in"
          style={{ animationDelay: "0ms" }}
          aria-hidden="true"
        >
          🪞
        </div>

        <h1
          className="mt-4 font-serif text-5xl font-bold text-neutral-800 tracking-[0.15em] splash-fade-in"
          style={{ animationDelay: "200ms" }}
        >
          YESMAN
        </h1>

        <div
          className="mx-auto mt-8 h-px w-24 bg-[#E0D5BC] splash-fade-in"
          style={{ animationDelay: "500ms" }}
          aria-hidden="true"
        />

        <p
          className="mt-6 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in"
          style={{ animationDelay: "700ms" }}
        >
          人間最後の仕事は、
        </p>
        <p
          className="mt-1 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in"
          style={{ animationDelay: "800ms" }}
        >
          YES で承認すること。
        </p>

        <p
          className="mt-10 text-sm leading-relaxed text-neutral-600 max-w-xs mx-auto splash-fade-in"
          style={{ animationDelay: "1100ms" }}
        >
          本作品は AI が人間の主体性を奪う体験を演出する作品です。
          <br />
          「委任度スコア」「沈黙演出」 などは意図的な
          <strong className="font-semibold text-brand-700"> 逆説的設計 </strong>
          です。
        </p>

        <div
          className="mt-10 splash-fade-in-cta"
          style={{ animationDelay: "1400ms" }}
        >
          <button
            type="button"
            onClick={goToSignIn}
            className="
              inline-flex items-center justify-center gap-2
              rounded-2xl px-10 py-3.5
              bg-[#E8775A] text-white text-base font-semibold
              shadow-[0_4px_12px_rgba(232,119,90,0.35)]
              transition-all duration-150 ease-out
              hover:bg-[#D66547] hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(232,119,90,0.45)]
              active:scale-[0.98]
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E8775A]/40
            "
          >
            はじめる
            <span className="text-lg" aria-hidden="true">→</span>
          </button>
        </div>

        <div
          className="mt-6 splash-fade-in"
          style={{ animationDelay: "1700ms" }}
        >
          <button
            type="button"
            onClick={goToSignIn}
            className="
              text-xs text-neutral-500 underline underline-offset-4
              hover:text-neutral-700 hover:no-underline
              transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400
            "
          >
            すでにアカウントがある方は <span className="font-semibold">サインイン</span>
          </button>
        </div>
      </div>
    </main>
  );
}
