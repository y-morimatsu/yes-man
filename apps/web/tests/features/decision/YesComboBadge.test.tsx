/**
 * YesComboBadge unit test — count 段階別表示 + brokeCombo の演出.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { YesComboBadge } from "../../../src/features/decision/YesComboBadge";

describe("YesComboBadge", () => {
  it("count=1 では何も render しない", () => {
    const { container } = render(
      <YesComboBadge count={1} brokeCombo={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("count=2 で '2 連 Yes' + 🔥 (tier1)", () => {
    render(<YesComboBadge count={2} brokeCombo={false} />);
    expect(screen.getByText(/2 連 Yes/)).toBeInTheDocument();
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });

  it("count=3 で 🌟 (tier2)", () => {
    render(<YesComboBadge count={3} brokeCombo={false} />);
    expect(screen.getByText(/3 連 Yes/)).toBeInTheDocument();
    expect(screen.getByText("🌟")).toBeInTheDocument();
  });

  it("count=5 で ⚡ (tier3)", () => {
    render(<YesComboBadge count={5} brokeCombo={false} />);
    expect(screen.getByText(/5 連 Yes/)).toBeInTheDocument();
    expect(screen.getByText("⚡")).toBeInTheDocument();
  });

  it("count=10 で 🏆 (tier4) + 大爆発級 styling", () => {
    render(<YesComboBadge count={10} brokeCombo={false} />);
    expect(screen.getByText(/10 連 Yes/)).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  it("count=20 でも tier4 (max tier) 文言は数値そのまま", () => {
    render(<YesComboBadge count={20} brokeCombo={false} />);
    expect(screen.getByText(/20 連 Yes/)).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  it("brokeCombo=true で 'コンボ break' + 💔 を表示 (count 無視)", () => {
    render(<YesComboBadge count={5} brokeCombo />);
    expect(screen.getByText(/コンボ break/)).toBeInTheDocument();
    expect(screen.getByText("💔")).toBeInTheDocument();
    // 通常 badge は出ない
    expect(screen.queryByText(/連 Yes/)).not.toBeInTheDocument();
  });

  it("brokeCombo 表示中、1.4s 後に onBrokeComboShown コールバックが呼ばれる", () => {
    vi.useFakeTimers();
    const onShown = vi.fn();
    render(<YesComboBadge count={3} brokeCombo onBrokeComboShown={onShown} />);
    expect(onShown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1400);
    expect(onShown).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("count の data 属性がついている (test/styling フック)", () => {
    render(<YesComboBadge count={3} brokeCombo={false} />);
    const badge = screen.getByTestId("yes-combo-badge");
    expect(badge.getAttribute("data-ym-combo-count")).toBe("3");
  });
});
