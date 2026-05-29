/**
 * HomePage — mockup §4 通り「決めてもらう人」 card + 履歴 + 委任率 strip.
 * 2026-05-24 visual overhaul: 旧 SummaryCard / 5 nav grid を廃止して mockup §4 に整合.
 */
import { describe, expect, it, afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import HomePage from "../../../src/features/home/HomePage";

const server = setupServer();

function defaultHandlers(score: {
  no_count: number;
  total: number;
  ratio: number | null;
  message: string;
}, items: Array<{ id: string; proposal_text: string; created_at: string; user_choice: "yes" | "no" | "pending"; user_input: string; attempt_count: number }> = []) {
  server.use(
    http.get("http://localhost:8000/v1/scores/me", () =>
      HttpResponse.json({ ...score, history: [] }),
    ),
    http.get("http://localhost:8000/v1/decisions", () =>
      HttpResponse.json({ items, limit: 3 }),
    ),
  );
}

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <HomePage />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("HomePage (mockup §4)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("「決めてもらう人」 call card を render する", async () => {
    defaultHandlers({ no_count: 1, total: 12, ratio: 0.92, message: "OK" });
    renderHome();
    expect(await screen.findByTestId("home-call-card")).toBeInTheDocument();
    expect(screen.getByTestId("home-decide")).toHaveTextContent("決めてもらう");
  });

  it("「決めてもらう」 button は /decision に navigate する link 動線を持つ", async () => {
    defaultHandlers({ no_count: 0, total: 0, ratio: null, message: "empty" });
    renderHome();
    const btn = await screen.findByTestId("home-decide");
    expect(btn).toBeInTheDocument();
  });

  it("履歴がない場合 placeholder 表示", async () => {
    defaultHandlers({ no_count: 0, total: 0, ratio: null, message: "empty" }, []);
    renderHome();
    await waitFor(() =>
      expect(screen.getByText(/まだ決定がありません/)).toBeInTheDocument(),
    );
  });

  it("履歴が 3 件あれば row が並ぶ", async () => {
    const now = new Date().toISOString();
    defaultHandlers(
      { no_count: 1, total: 3, ratio: 0.66, message: "OK" },
      [
        { id: "d1", user_input: "今日のランチ", proposal_text: "カツ丼を 食べる", user_choice: "yes", created_at: now, attempt_count: 1 },
        { id: "d2", user_input: "夜の予定", proposal_text: "早めに 寝る", user_choice: "yes", created_at: now, attempt_count: 1 },
        { id: "d3", user_input: "週末", proposal_text: "本を 1 冊 買う", user_choice: "yes", created_at: now, attempt_count: 1 },
      ],
    );
    renderHome();
    await waitFor(() => {
      expect(screen.getByText(/カツ丼を 食べる/)).toBeInTheDocument();
      expect(screen.getByText(/早めに 寝る/)).toBeInTheDocument();
      expect(screen.getByText(/本を 1 冊 買う/)).toBeInTheDocument();
    });
  });

  it("score が取得できれば 委任率 strip が表示される", async () => {
    defaultHandlers({ no_count: 1, total: 12, ratio: 0.92, message: "うまく任せられてます" });
    renderHome();
    await waitFor(() => {
      expect(screen.getByTestId("home-score-strip")).toBeInTheDocument();
      expect(screen.getByText("92%")).toBeInTheDocument();
    });
  });

  it("score が未取得 (ratio=null + total=0) なら strip を表示しない", async () => {
    defaultHandlers({ no_count: 0, total: 0, ratio: null, message: "empty" });
    renderHome();
    // call card はすぐ表示、strip は ratio=null → 非表示
    await screen.findByTestId("home-call-card");
    expect(screen.queryByTestId("home-score-strip")).not.toBeInTheDocument();
  });
});
