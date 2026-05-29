import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickStartCard } from "../../../src/features/decision/QuickStartCard";

function renderCard(overrides: Partial<React.ComponentProps<typeof QuickStartCard>> = {}) {
  const props = {
    title: "今日のランチ",
    noCount: 0,
    onYes: vi.fn(),
    onNo: vi.fn(),
    onSwitchToText: vi.fn(),
    ...overrides,
  };
  render(<QuickStartCard {...props} />);
  return props;
}

describe("QuickStartCard (v3: SwipeChoice 統一)", () => {
  it("title + SwipeChoice の fallback button (← No / Yes →) + 自分で入力 link を表示", () => {
    renderCard();
    expect(screen.getByText("今日のランチ")).toBeInTheDocument();
    // 2026-05-26: "してみますか?" fixed suffix は user 指示で削除. title 単独表示.
    expect(screen.queryByText(/してみますか/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quickstart-card")).toBeInTheDocument();
    expect(screen.getByTestId("swipe-choice")).toBeInTheDocument();
    // SwipeChoice の WCAG fallback button (aria-label で識別)
    expect(screen.getByRole("button", { name: /Yes、提案を採択/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No、別案を再生成/ })).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-switch-to-text")).toBeInTheDocument();
  });

  it("fallback `Yes →` button click で onYes が呼ばれる", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByRole("button", { name: /Yes、提案を採択/ }));
    expect(props.onYes).toHaveBeenCalledTimes(1);
  });

  it("fallback `← No` button click で onNo が呼ばれる", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByRole("button", { name: /No、別案を再生成/ }));
    expect(props.onNo).toHaveBeenCalledTimes(1);
  });

  it("switch link click で onSwitchToText が呼ばれる", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByTestId("quickstart-switch-to-text"));
    expect(props.onSwitchToText).toHaveBeenCalledTimes(1);
  });

  it("ArrowRight キーで onYes が呼ばれる (SwipeChoice 既存の a11y)", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    const card = screen.getByTestId("swipe-card");
    card.focus();
    await user.keyboard("{ArrowRight}");
    // SwipeChoice は確定後 180ms 遅延で callback (setTimeout)
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => expect(props.onYes).toHaveBeenCalledTimes(1));
  });

  it("ArrowLeft キーで onNo が呼ばれる (SwipeChoice 既存の a11y)", async () => {
    // SwipeChoice は確定すると confirming state が残るため、別 component instance で
    // 検証する (ArrowRight と ArrowLeft を 1 component で連続発火すると 2 回目が ignore される)
    const user = userEvent.setup();
    const props = renderCard();
    const card = screen.getByTestId("swipe-card");
    card.focus();
    await user.keyboard("{ArrowLeft}");
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => expect(props.onNo).toHaveBeenCalledTimes(1));
  });

  it("noCount 1..4 で「▼ NO n/5」が表示、0 や 5 では非表示", () => {
    const { unmount } = render(
      <QuickStartCard
        title="x"
        noCount={2}
        onYes={() => {}}
        onNo={() => {}}
        onSwitchToText={() => {}}
      />,
    );
    expect(screen.getByTestId("quickstart-no-count")).toHaveTextContent(/NO 2 \/ 5/);
    unmount();

    render(
      <QuickStartCard
        title="x"
        noCount={0}
        onYes={() => {}}
        onNo={() => {}}
        onSwitchToText={() => {}}
      />,
    );
    expect(screen.queryByTestId("quickstart-no-count")).not.toBeInTheDocument();
  });

  it("title 表示部 (aria-live=polite) が存在し、title 変更を SR に通知できる", () => {
    renderCard();
    const region = screen.getByText("今日のランチ").closest("[aria-live='polite']");
    expect(region).not.toBeNull();
  });
});
