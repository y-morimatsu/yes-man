import { describe, expect, it, afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { DecisionHistoryList } from "../../../src/features/score/DecisionHistoryList";

const server = setupServer();

type HistoryItem = {
  id: string;
  user_input: string;
  proposal_text: string;
  user_choice: "yes" | "no" | "pending";
  attempt_count: number;
  created_at: string;
};

function setup(items: HistoryItem[]) {
  server.use(
    http.get("http://localhost:8000/v1/decisions", () =>
      HttpResponse.json({ items, limit: 20 }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <DecisionHistoryList />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionHistoryList", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders 3 items with question, proposal, and adoption count", async () => {
    setup([
      {
        id: "1",
        user_input: "今日のランチどうしよう？",
        proposal_text: "コンビニのサラダチキン定食",
        user_choice: "yes",
        attempt_count: 1,
        created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        id: "2",
        user_input: "今夜の映画 何見よう？",
        proposal_text: "Dune: Part Two",
        user_choice: "yes",
        attempt_count: 3,
        created_at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      },
      {
        id: "3",
        user_input: "週末の家族旅行どこ行く？",
        proposal_text: "箱根 1 泊温泉プラン",
        user_choice: "yes",
        attempt_count: 5,
        created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(/今日のランチどうしよう/)).toBeInTheDocument();
    });
    expect(screen.getByText(/コンビニのサラダチキン定食/)).toBeInTheDocument();
    expect(screen.getByText(/🌟 1 回目で採用/)).toBeInTheDocument();
    expect(screen.getByText(/🔄 3 回目で採用/)).toBeInTheDocument();
    expect(screen.getByText(/🔄 5 回目で採用/)).toBeInTheDocument();
  });

  it("renders section heading", async () => {
    setup([
      {
        id: "1",
        user_input: "Q",
        proposal_text: "P",
        user_choice: "yes",
        attempt_count: 1,
        created_at: new Date().toISOString(),
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(/📜 最近の Yes 採択/)).toBeInTheDocument();
    });
    expect(screen.getByText(/最大 20 件/)).toBeInTheDocument();
  });

  it("renders empty state when no items", async () => {
    setup([]);
    await waitFor(() => {
      expect(screen.getByText(/まだ Yes 採択の履歴がありません/)).toBeInTheDocument();
    });
  });

  it("does not render component when API errors (silent fail)", async () => {
    server.use(
      http.get("http://localhost:8000/v1/decisions", () =>
        HttpResponse.error(),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <ApiProvider>
            <QueryClientProvider client={qc}>
              <DecisionHistoryList />
            </QueryClientProvider>
          </ApiProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // section heading が無いことで silent fail を確認
      expect(screen.queryByText(/最近の Yes 採択/)).not.toBeInTheDocument();
    });
    expect(container.textContent).not.toContain("最近の Yes 採択");
  });
});
