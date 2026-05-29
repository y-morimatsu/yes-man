/**
 * SwipeChoice.test.tsx — 2026-05-26 drill-down-auto-open (FR-DAO-09 + NFR-DAO-10).
 *
 * Verifies:
 * - onYesSync が 3 Yes path (right-swipe / fallback button click / ArrowRight) すべてで
 *   onYes より先に同期発火する (user gesture chain 内 popup block 回避).
 * - onYesSync 内で例外を投げても onYes は呼ばれる (try-catch 保証).
 * - yesAriaLabelOverride が Yes button の aria-label を上書きする.
 * - 既存挙動 (proposalText 表示 / disabled / showSwipeHint) は不変.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeChoice } from "../../src/composites/SwipeChoice";

describe("SwipeChoice — drill-down-auto-open (FR-DAO-09 + NFR-DAO-10)", () => {
  beforeEach(() => {
    // vibrate のスタブ (jsdom にはない)
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  describe("onYesSync invocation order (3 Yes path)", () => {
    it("fallback button click: onYesSync が onYes より先に同期発火する", () => {
      const order: string[] = [];
      const onYes = vi.fn(() => order.push("onYes"));
      const onYesSync = vi.fn(() => order.push("onYesSync"));

      render(
        <SwipeChoice
          proposalText="テスト提案"
          onYes={onYes}
          onNo={() => {}}
          onYesSync={onYesSync}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Yes/ }));
      expect(order).toEqual(["onYesSync", "onYes"]);
      expect(onYesSync).toHaveBeenCalledOnce();
      expect(onYes).toHaveBeenCalledOnce();
    });

    it("ArrowRight keyboard: onYesSync が onYes より先に同期発火し、onYes は 180ms 後", async () => {
      vi.useFakeTimers();
      const order: string[] = [];
      const onYes = vi.fn(() => order.push("onYes"));
      const onYesSync = vi.fn(() => order.push("onYesSync"));

      render(
        <SwipeChoice
          proposalText="x"
          onYes={onYes}
          onNo={() => {}}
          onYesSync={onYesSync}
        />,
      );
      fireEvent.keyDown(screen.getByTestId("swipe-card"), { key: "ArrowRight" });

      // onYesSync は即同期発火、onYes は setTimeout(180) で遅延
      expect(onYesSync).toHaveBeenCalledOnce();
      expect(onYes).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(onYes).toHaveBeenCalledOnce();
      expect(order).toEqual(["onYesSync", "onYes"]);

      vi.useRealTimers();
    });

    it("onYesSync が例外を投げても onYes は呼ばれる (try-catch 保証)", () => {
      const onYes = vi.fn();
      const onYesSync = vi.fn(() => {
        throw new Error("popup blocked");
      });

      render(
        <SwipeChoice
          proposalText="x"
          onYes={onYes}
          onNo={() => {}}
          onYesSync={onYesSync}
        />,
      );

      // throw しても test 自体は失敗せず onYes が呼ばれる
      expect(() => fireEvent.click(screen.getByRole("button", { name: /Yes/ }))).not.toThrow();
      expect(onYesSync).toHaveBeenCalledOnce();
      expect(onYes).toHaveBeenCalledOnce();
    });

    it("onYesSync 未指定なら onYes のみ呼ばれる (既存挙動と互換)", () => {
      const onYes = vi.fn();

      render(<SwipeChoice proposalText="x" onYes={onYes} onNo={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /Yes/ }));

      expect(onYes).toHaveBeenCalledOnce();
    });
  });

  describe("yesAriaLabelOverride (NFR-DAO-10)", () => {
    it("override 未指定の場合 default '...提案を採択' aria-label", () => {
      render(<SwipeChoice proposalText="x" onYes={() => {}} onNo={() => {}} />);
      const yesBtn = screen.getByRole("button", { name: /Yes/ });
      expect(yesBtn).toHaveAttribute("aria-label", "Yes、提案を採択");
    });

    it("override 指定で aria-label が上書きされる", () => {
      const override = "Yes、提案を採択 (新しいタブで Amazon Prime Video を開きます)";
      render(
        <SwipeChoice
          proposalText="x"
          onYes={() => {}}
          onNo={() => {}}
          yesAriaLabelOverride={override}
        />,
      );
      const yesBtn = screen.getByRole("button", { name: override });
      expect(yesBtn).toHaveAttribute("aria-label", override);
    });
  });

  describe("regression (既存挙動の維持)", () => {
    it("proposalText を表示する (default rendering)", () => {
      render(<SwipeChoice proposalText="食事は何にしますか" onYes={() => {}} onNo={() => {}} />);
      expect(screen.getByText("食事は何にしますか")).toBeInTheDocument();
    });

    it("disabled で No/Yes button が disabled", () => {
      render(<SwipeChoice proposalText="x" onYes={() => {}} onNo={() => {}} disabled />);
      const yesBtn = screen.getByRole("button", { name: /Yes/ });
      const noBtn = screen.getByRole("button", { name: /No/ });
      expect(yesBtn).toBeDisabled();
      expect(noBtn).toBeDisabled();
    });

    it("disabled 時は onYesSync も onYes も呼ばれない", () => {
      const onYes = vi.fn();
      const onYesSync = vi.fn();
      render(
        <SwipeChoice
          proposalText="x"
          onYes={onYes}
          onNo={() => {}}
          onYesSync={onYesSync}
          disabled
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Yes/ }));
      expect(onYesSync).not.toHaveBeenCalled();
      expect(onYes).not.toHaveBeenCalled();
    });
  });
});
