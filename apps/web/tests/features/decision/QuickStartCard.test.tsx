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

describe("QuickStartCard", () => {
  it("title + してみますか? + YES/NO + 自分で入力 link を表示", () => {
    renderCard();
    expect(screen.getByText("今日のランチ")).toBeInTheDocument();
    expect(screen.getByText(/してみますか/)).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-yes")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-no")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-switch-to-text")).toBeInTheDocument();
  });

  it("YES クリックで onYes、NO クリックで onNo、switch link で onSwitchToText", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByTestId("quickstart-yes"));
    expect(props.onYes).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("quickstart-no"));
    expect(props.onNo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("quickstart-switch-to-text"));
    expect(props.onSwitchToText).toHaveBeenCalledTimes(1);
  });

  it("Y キーで onYes、N キーで onNo (window keydown)", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.keyboard("y");
    expect(props.onYes).toHaveBeenCalledTimes(1);
    await user.keyboard("n");
    expect(props.onNo).toHaveBeenCalledTimes(1);
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

  it("aria-live=polite で title 変更を SR に通知する", () => {
    renderCard();
    const region = screen.getByText("今日のランチ").closest("[aria-live='polite']");
    expect(region).not.toBeNull();
  });
});
