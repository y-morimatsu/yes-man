import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import ScorePage from "../../../src/features/score/ScorePage";

const server = setupServer();

function setup(score: {
  no_count: number;
  total: number;
  ratio: number | null;
  message: string;
  history?: { date: string; yes_ratio: number | null; total: number }[];
}) {
  server.use(
    http.get("http://localhost:8000/v1/scores/me", () =>
      HttpResponse.json({ ...score, history: score.history ?? [] }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>
          <ScorePage />
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}

describe("ScorePage", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders danger UI when no_count >= 5", async () => {
    setup({ no_count: 6, total: 10, ratio: 0.4, message: "Test message" });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/No 連発を検知/)).toBeInTheDocument();
  });

  it("renders ok UI without warning when no_count low", async () => {
    setup({ no_count: 1, total: 10, ratio: 0.9, message: "OK" });
    // ScorePage は message を 「{message}」 形式で表示 (line 70)
    await waitFor(() => {
      expect(screen.getByText(/「OK」/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No 連発を検知/)).not.toBeInTheDocument();
  });
});

// vitest globals not enabled in this config、explicit imports
import { afterAll, afterEach, beforeAll } from "vitest";
