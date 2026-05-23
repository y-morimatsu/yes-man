import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import DecisionPage from "../../../src/features/decision/DecisionPage";
import { clearRecentYes } from "../../../src/features/decision/quickStartHistory";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <DecisionPage />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionPage", () => {
  beforeEach(() => clearRecentYes());
  afterEach(() => clearRecentYes());

  it("初期 render: title + QuickStartCard (SwipeChoice 内包) が表示、textbox は出ない", () => {
    setup();
    expect(screen.getByRole("heading", { name: /何を きめますか/ })).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-card")).toBeInTheDocument();
    expect(screen.getByTestId("swipe-choice")).toBeInTheDocument();
    // SwipeChoice fallback button
    expect(screen.getByRole("button", { name: /Yes、提案を採択/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No、提案を拒否/ })).toBeInTheDocument();
    // textbox は QuickStart モードでは非表示
    expect(screen.queryByPlaceholderText(/今日/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /送信/ })).not.toBeInTheDocument();
  });

  it("「自分で入力する」 link クリックで textbox + 送信ボタンが出現", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("quickstart-switch-to-text"));
    expect(screen.queryByTestId("quickstart-card")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/今日/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /送信/ })).toBeInTheDocument();
  });

  it("textbox 表示時に送信ボタンは empty 入力で disabled", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("quickstart-switch-to-text"));
    expect(screen.getByRole("button", { name: /送信/ })).toBeDisabled();
  });
});
