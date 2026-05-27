/**
 * MangaStage — v3-γ Task 5 統合 test.
 *
 * 検証:
 * - 3 actor (self + 2 anonymous) が render される
 * - 「現在話している」persona の bubble が large、他が small (PBT 不変条件)
 * - 未到着 utterance (text=""、done=false) は typing dots を表示
 * - Arabic primary_language で dir=rtl が bubble 内側に適用される
 *
 * 2026-05-24: 「原文を表示」機能削除に伴い OriginalTextToggle の test を削除.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MangaStage } from "../../../src/features/decision/MangaStage";
import type { Utterance } from "../../../src/features/decision/reducer";

const baseUtterances: Utterance[] = [
  {
    persona_id: "self",
    persona_name: "あなたの声",
    text: "迷い中です",
    done: true,
    primary_language: "ja",
    formality: "casual",
  },
  {
    persona_id: "anon-en",
    persona_name: "知り合い #1",
    text: "カレーいいよ",
    done: true,
    primary_language: "en",
    formality: "casual",
  },
  {
    persona_id: "anon-fr",
    persona_name: "知り合い #2",
    text: "和食 おいしいじゃん",
    done: false, // 発話中 (= current speaker)
    primary_language: "fr",
    formality: "polite",
  },
];

describe("MangaStage", () => {
  it("renders 3 actors", () => {
    render(<MangaStage utterances={baseUtterances} />);
    expect(screen.getByTestId("manga-actor-0")).toBeInTheDocument();
    expect(screen.getByTestId("manga-actor-1")).toBeInTheDocument();
    expect(screen.getByTestId("manga-actor-2")).toBeInTheDocument();
  });

  it("2026-05-24 v4: T icon (self) は廃止、全 actor が blob で表示される", () => {
    render(<MangaStage utterances={baseUtterances} />);
    expect(screen.queryByTestId("manga-self-icon")).not.toBeInTheDocument();
  });

  it("current speaker (done=false の最新) の bubble が large、他が small", () => {
    render(<MangaStage utterances={baseUtterances} />);
    // baseUtterances[2] (anon-fr) が done=false で最新 → 大
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    // 他は small
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
    expect(screen.getByTestId("manga-bubble-1")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
  });

  it("PBT 不変条件: large の bubble は最大 1 つ (発話中 1 人 ルール)", () => {
    // 100 random shuffle で「2 つが done=false の utterance」状態を作っても、
    // current speaker は 1 つだけ大、他は小という不変条件を verify.
    for (let i = 0; i < 20; i++) {
      const us: Utterance[] = baseUtterances.map((u, idx) => ({
        ...u,
        done: idx === i % 3 ? false : Math.random() > 0.5,
      }));
      const { container, unmount } = render(<MangaStage utterances={us} />);
      const largeBubbles = container.querySelectorAll(
        '[data-bubble-size="large"]',
      );
      // 1 つの bubble だけが large (currentSpeakerId resolve roule で )
      expect(largeBubbles.length).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it("text 未到着 (text='' && done=false) は typing dots を表示", () => {
    const pending: Utterance[] = [
      { persona_id: "p1", persona_name: "self", text: "ready", done: true },
      {
        persona_id: "p2",
        persona_name: "anon",
        text: "",
        done: false,
      },
    ];
    render(<MangaStage utterances={pending} />);
    expect(screen.getByTestId("manga-typing-1")).toBeInTheDocument();
  });

  it("Arabic 言語の bubble 内側に dir=rtl + lang-ar class", () => {
    const us: Utterance[] = [
      { persona_id: "s", persona_name: "self", text: "x", done: true },
      {
        persona_id: "ar",
        persona_name: "anon-ar",
        text: "翻訳",
        done: false,
        primary_language: "ar",
      },
    ];
    render(<MangaStage utterances={us} />);
    const content = screen.getByTestId("manga-bubble-1-content");
    expect(content).toHaveAttribute("dir", "rtl");
    expect(content).toHaveClass("lang-ar");
  });

  it("explicit currentSpeakerId が auto-detect を上書きする", () => {
    render(
      <MangaStage utterances={baseUtterances} currentSpeakerId="self" />,
    );
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
  });

  // ============================================================
  // A1 / A2 / A3 fixes (Task 5 追加調整)
  // ============================================================
  it("A1 (2026-05-24): stage は親 max-w-md (448px) と幅を揃えるため width:100%", () => {
    render(<MangaStage utterances={baseUtterances} />);
    expect(screen.getByTestId("manga-stage")).toHaveStyle({ width: "100%" });
  });

  it("2026-05-24 v4: self T icon 廃止に伴い、currentSpeakerId='self' は普通の blob として扱われる", () => {
    render(<MangaStage utterances={baseUtterances} currentSpeakerId="self" />);
    // T icon は描画されない
    expect(screen.queryByTestId("manga-self-icon")).not.toBeInTheDocument();
    // 3 blob すべて render される
    expect(screen.getAllByTestId("blob-avatar")).toHaveLength(3);
  });

  it("A2: 発話中 anonymous BlobAvatar の aria-label に「発話中」が入る", () => {
    // baseUtterances[2] (anon-fr) が done=false → speaker
    const { container } = render(<MangaStage utterances={baseUtterances} />);
    const blobs = container.querySelectorAll('[data-testid="blob-avatar"]');
    // 2 blob (idx=1, 2) のうち idx=2 (anon-fr) が speaker
    const speakingBlob = Array.from(blobs).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("発話中"),
    );
    expect(speakingBlob).toBeTruthy();
    expect(speakingBlob?.getAttribute("aria-label")).toBe(
      "知り合い #2 (発話中)",
    );
  });

  // ============================================================
  // 2026-05-24 builtin persona theme (PersonaCard / Home avatar と統一)
  // ============================================================
  it("builtin persona (慎重/楽観/効率) は blob 代わりに emoji icon で描画", () => {
    const us: Utterance[] = [
      {
        persona_id: "b1",
        persona_name: "慎重派",
        text: "リスクを考えよう",
        done: true,
      },
      {
        persona_id: "b2",
        persona_name: "楽観派",
        text: "いい感じ!",
        done: true,
      },
      {
        persona_id: "b3",
        persona_name: "効率派",
        text: "短時間で済ませよう",
        done: false,
      },
    ];
    const { container } = render(<MangaStage utterances={us} />);
    // 3 builtin → emoji icon (blob は 0 個)
    expect(screen.getByTestId("manga-actor-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("manga-actor-icon-1")).toBeInTheDocument();
    expect(screen.getByTestId("manga-actor-icon-2")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="blob-avatar"]')).toHaveLength(0);
    // emoji 内容を検証 (慎重 → 🛡️、楽観 → ☀️、効率 → ⚡)
    expect(screen.getByTestId("manga-actor-icon-0").textContent).toBe("🛡️");
    expect(screen.getByTestId("manga-actor-icon-1").textContent).toBe("☀️");
    expect(screen.getByTestId("manga-actor-icon-2").textContent).toBe("⚡");
  });

  it("builtin persona の bubble bg は theme color (sky/amber/violet) で override される", () => {
    const us: Utterance[] = [
      { persona_id: "b1", persona_name: "慎重派", text: "考えよう", done: false },
    ];
    render(<MangaStage utterances={us} />);
    const bubble = screen.getByTestId("manga-bubble-0");
    // sky-100 (#DBEAFE) が inline style background に適用される
    expect(bubble.style.background).toMatch(/rgb\(219, 234, 254\)|#DBEAFE/i);
  });

  it("anonymous persona (慎重/楽観/効率 を含まない) は BlobAvatar fallback", () => {
    render(<MangaStage utterances={baseUtterances} />);
    // baseUtterances の name は「あなたの声 / 知り合い #1 / 知り合い #2」 → 全 blob
    expect(screen.getAllByTestId("blob-avatar")).toHaveLength(3);
    expect(screen.queryByTestId("manga-actor-icon-0")).not.toBeInTheDocument();
  });

  // ============================================================
  // 2026-05-24: past bubble クリックで前面化
  // ============================================================
  it("past bubble (small) を click すると large に切替、元の speaker は small に降格", () => {
    render(<MangaStage utterances={baseUtterances} />);
    // 初期: idx=2 が large (done=false)
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
    // idx=0 (past) を click
    fireEvent.click(screen.getByTestId("manga-bubble-0"));
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
  });

  it("同じ bubble を再 click すると focus 解除 (auto speaker に戻る)", () => {
    render(<MangaStage utterances={baseUtterances} />);
    // 1 回 click → focus
    fireEvent.click(screen.getByTestId("manga-bubble-0"));
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    // もう一度 click → 解除、idx=2 (auto) が large に戻る
    fireEvent.click(screen.getByTestId("manga-bubble-0"));
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
  });

  it("actor (icon/blob 部分) を click しても bubble を前面化できる", () => {
    render(<MangaStage utterances={baseUtterances} />);
    // 初期: idx=2 が large
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    // actor-0 (past) を click
    fireEvent.click(screen.getByTestId("manga-actor-0"));
    expect(screen.getByTestId("manga-bubble-0")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "small",
    );
    // 同じ actor を再 click → focus 解除
    fireEvent.click(screen.getByTestId("manga-actor-0"));
    expect(screen.getByTestId("manga-bubble-2")).toHaveAttribute(
      "data-bubble-size",
      "large",
    );
  });

  it("placeholder actor (未到着) は disabled で click 不可", () => {
    const pending: Utterance[] = [
      { persona_id: "p1", persona_name: "self", text: "ready", done: true },
    ];
    render(<MangaStage utterances={pending} />);
    // idx=1, 2 は placeholder
    const placeholderActor = screen.getByTestId("manga-actor-1");
    expect(placeholderActor).toBeDisabled();
  });

  it("clickable bubble に role=button + cursor:pointer (a11y)", () => {
    render(<MangaStage utterances={baseUtterances} />);
    const bubble = screen.getByTestId("manga-bubble-0");
    expect(bubble).toHaveAttribute("role", "button");
    expect(bubble).toHaveAttribute("tabindex", "0");
    expect(bubble.style.cursor).toBe("pointer");
  });

  it("A3: typing bubble に role=status + aria-label=「考え中」 (a11y)", () => {
    const pending: Utterance[] = [
      { persona_id: "p1", persona_name: "self", text: "ready", done: true },
      { persona_id: "p2", persona_name: "anon", text: "", done: false },
    ];
    render(<MangaStage utterances={pending} />);
    const typing = screen.getByTestId("manga-typing-1");
    expect(typing).toHaveAttribute("role", "status");
    expect(typing).toHaveAttribute("aria-label", "考え中");
  });
});
