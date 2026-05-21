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

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import { AuthProvider } from "../../../src/shell/AuthProvider";
import SignInPage from "../../../src/features/auth/SignInPage";
import { registerUser, listUsers, getCurrentEmail } from "../../../src/shell/mockAuthStorage";

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
    expect(screen.getByRole("heading", { name: /サインイン/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /表示名/ })).toBeInTheDocument();
    expect(screen.getByText(/まだ登録ユーザはいません/)).toBeInTheDocument();
  });

  it("email 未入力時 [サインイン] が disabled", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: "サインイン" });
    expect(btn).toBeDisabled();
  });

  it("不正な email format で [サインイン] が disabled", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: /email/i }), "not-an-email");
    expect(screen.getByRole("button", { name: "サインイン" })).toBeDisabled();
  });

  it("有効な email 入力 + [サインイン] click で自動登録 + navigate", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: /email/i }), "taro@example.com");
    await user.type(screen.getByRole("textbox", { name: /表示名/ }), "Taro");
    await user.click(screen.getByRole("button", { name: "サインイン" }));

    await waitFor(() => {
      expect(listUsers()).toHaveLength(1);
      expect(listUsers()[0].email).toBe("taro@example.com");
      expect(listUsers()[0].display_name).toBe("Taro");
      expect(getCurrentEmail()).toBe("taro@example.com");
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("既存 user row click で setCurrentEmail + navigate", async () => {
    registerUser("hanako@example.com", "Hanako");
    const user = userEvent.setup();
    renderPage();
    // 行内の email がクリック可能 button として表示される
    const row = screen.getByRole("button", { name: /hanako@example\.com/ });
    await user.click(row);

    await waitFor(() => {
      expect(getCurrentEmail()).toBe("hanako@example.com");
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
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
    await user.type(screen.getByRole("textbox", { name: /email/i }), "taro@example.com");
    await user.click(screen.getByRole("button", { name: "サインイン" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/score", { replace: true }));
  });
});
