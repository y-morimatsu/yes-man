import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";

vi.mock("../../../src/shell/env", () => ({
  env: {
    apiBaseUrl: "http://localhost:8000",
    cognitoRegion: "ap-northeast-1",
    cognitoUserPoolId: "ap-northeast-1_test",
    cognitoAppClientId: "test-client",
    cognitoHostedUiUrl: "https://test.auth.example.com",
    appVersion: "test",
    isDev: true,
    authBypass: true,
    mockUserSub: "11111111-1111-1111-1111-111111111111",
    mockUserEmail: "test@example.com",
  },
}));

import type * as ReactRouterDom from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import { AuthProvider } from "../../../src/shell/AuthProvider";
import SignInPage from "../../../src/features/auth/SignInPage";
import { registerUser, listUsers, getCurrentEmail } from "../../../src/shell/mockAuthStorage";
import { markOnboarded } from "../../../src/features/onboarding/onboardingStorage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <SignInPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("SignInPage — bypass mode", () => {
  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockReset();
  });
  afterEach(() => localStorage.clear());

  it("初回訪問: 空 list の placeholder と form が表示される", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /はじめましょう/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /メールアドレス/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /表示名/ })).toBeInTheDocument();
    expect(screen.getByText(/まだ登録ユーザはいません/)).toBeInTheDocument();
  });

  it("email 未入力時 [続ける] が disabled", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: "続ける" });
    expect(btn).toBeDisabled();
  });

  it("不正な email format で [続ける] が disabled", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: /メールアドレス/ }), "not-an-email");
    expect(screen.getByRole("button", { name: "続ける" })).toBeDisabled();
  });

  it("有効な email 入力 + [続ける] click で自動登録 + navigate (新規ユーザは /onboarding)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: /メールアドレス/ }), "taro@example.com");
    await user.type(screen.getByRole("textbox", { name: /表示名/ }), "Taro");
    await user.click(screen.getByRole("button", { name: "続ける" }));

    await waitFor(() => {
      expect(listUsers()).toHaveLength(1);
      expect(listUsers()[0]!.email).toBe("taro@example.com");
      expect(listUsers()[0]!.display_name).toBe("Taro");
      expect(getCurrentEmail()).toBe("taro@example.com");
    });
    // v3-β: 新規ユーザは default flow で /onboarding に redirect (嗜好把握)
    expect(navigateMock).toHaveBeenCalledWith("/onboarding", { replace: true });
  });

  it("既存 user row click で setCurrentEmail + navigate (/decision)", async () => {
    const hanako = registerUser("hanako@example.com", "Hanako");
    // v3-β rev3: 既存ユーザは onboarding 完了済として扱う
    markOnboarded(hanako.sub);
    const user = userEvent.setup();
    renderPage();
    // 行内の email がクリック可能 button として表示される
    const row = screen.getByRole("button", { name: /hanako@example\.com/ });
    await user.click(row);

    await waitFor(() => {
      expect(getCurrentEmail()).toBe("hanako@example.com");
    });
    expect(navigateMock).toHaveBeenCalledWith("/decision", { replace: true });
  });

  it("registerUser 後に list が UI に反映される", () => {
    registerUser("a@example.com", "A");
    registerUser("b@example.com");
    renderPage();
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/まだ登録ユーザはいません/)).not.toBeInTheDocument();
  });

  it("location.state.from があれば navigate 先がそれになる", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[{ pathname: "/auth/signin", state: { from: { pathname: "/score" } } }]}>
        <ToastProvider>
          <AuthProvider>
            <SignInPage />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await user.type(screen.getByRole("textbox", { name: /メールアドレス/ }), "taro@example.com");
    await user.click(screen.getByRole("button", { name: "続ける" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/score", { replace: true }));
  });
});
