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

function setup(score: {
  no_count: number;
  total: number;
  ratio: number | null;
  message: string;
}) {
  server.use(
    http.get("http://localhost:8000/v1/scores/me", () =>
      HttpResponse.json({ ...score, history: [] }),
    ),
  );
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

describe("HomePage Summary card", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders summary with count and ratio when total > 0", async () => {
    setup({ no_count: 1, total: 12, ratio: 0.92, message: "OK" });
    await waitFor(() => {
      expect(screen.getByText(/12 件の決定/)).toBeInTheDocument();
      expect(screen.getByText(/Yes 比率 92%/)).toBeInTheDocument();
    });
  });

  it("renders empty state when total === 0", async () => {
    setup({ no_count: 0, total: 0, ratio: null, message: "empty" });
    await waitFor(() => {
      expect(screen.getByText(/まだありません/)).toBeInTheDocument();
    });
  });

  it("summary card links to /score when has data", async () => {
    setup({ no_count: 1, total: 12, ratio: 0.92, message: "OK" });
    await waitFor(() => {
      expect(screen.getByText(/12 件の決定/)).toBeInTheDocument();
    });
    const link = screen
      .getByText(/12 件の決定/)
      .closest("a");
    expect(link).toHaveAttribute("href", "/score");
  });

  it("summary card links to /decision when empty", async () => {
    setup({ no_count: 0, total: 0, ratio: null, message: "empty" });
    await waitFor(() => {
      expect(screen.getByText(/まだありません/)).toBeInTheDocument();
    });
    const link = screen
      .getByText(/まだありません/)
      .closest("a");
    expect(link).toHaveAttribute("href", "/decision");
  });

  it("renders loading text while score is pending", () => {
    // No msw handler set → request hangs, useScore stays in isPending
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("renders no summary card when score query errors", async () => {
    server.use(
      http.get("http://localhost:8000/v1/scores/me", () =>
        HttpResponse.error(),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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
    // After error resolves: 5 nav cards render, SummaryCard returns null
    await waitFor(() => {
      expect(screen.getByText(/💭 合議で決定/)).toBeInTheDocument();
      expect(screen.queryByText(/最近の YesMan/)).not.toBeInTheDocument();
      expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
    });
  });
});
