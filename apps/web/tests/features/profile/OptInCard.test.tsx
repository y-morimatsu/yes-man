/**
 * OptInCard — v3-γ Task 7 (US-2.1 / US-2.2 / US-2.3 / US-2.4).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { OptInCard } from "../../../src/features/profile/OptInCard";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <ApiProvider>
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
          </ApiProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const SAMPLE_PREVIEW = {
  persona_id: "uuid-self",
  value_tags: ["慎重派", "夜型"],
  primary_language: "ja",
  formality: "casual",
};

function mockEligibleNotOptedIn() {
  server.use(
    http.get("http://localhost:8000/v1/persona-pool/me", () =>
      HttpResponse.json({
        opted_in: false,
        preview: SAMPLE_PREVIEW,
        guard: { signal_total: 4, min_required: 3, is_eligible: true },
      }),
    ),
    http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
      HttpResponse.json({ today_count: 0, all_time_count: 0 }),
    ),
  );
}

function mockOptedIn() {
  server.use(
    http.get("http://localhost:8000/v1/persona-pool/me", () =>
      HttpResponse.json({
        opted_in: true,
        preview: SAMPLE_PREVIEW,
        guard: { signal_total: 4, min_required: 3, is_eligible: true },
      }),
    ),
    http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
      HttpResponse.json({ today_count: 5, all_time_count: 12 }),
    ),
  );
}

function mockEmptyProfile() {
  server.use(
    http.get("http://localhost:8000/v1/persona-pool/me", () =>
      HttpResponse.json({
        opted_in: false,
        preview: null,
        guard: { signal_total: 0, min_required: 3, is_eligible: false },
      }),
    ),
    http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
      HttpResponse.json({ today_count: 0, all_time_count: 0 }),
    ),
  );
}

// ============================================================
// US-2.3 AC-1: preview 常時表示 (OFF でも)
// ============================================================
describe("OptInCard preview 常時表示 (US-2.3)", () => {
  it("opt-in OFF でも preview セクションが表示される", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    expect(await screen.findByTestId("opt-in-preview")).toBeInTheDocument();
    expect(screen.getByText(/もし ON にすると 以下が 流通します/)).toBeInTheDocument();
    // tags が表示される (2026-05-24: quirks 仕様削除)
    const tags = screen.getAllByTestId("opt-in-preview-tag");
    expect(tags).toHaveLength(2);
    expect(tags[0]).toHaveTextContent("慎重派");
  });

  it("opt-in ON では preview header が「現在 流通中の あなたのデータ」 に変わる", async () => {
    mockOptedIn();
    render(<OptInCard />, { wrapper });
    expect(await screen.findByTestId("opt-in-preview")).toBeInTheDocument();
    expect(
      screen.getByText(/現在 流通中の あなたのデータ/),
    ).toBeInTheDocument();
  });
});

// ============================================================
// US-2.4: guard 不足時 disabled + inline message
// ============================================================
describe("OptInCard guard 不足 (US-2.4 / FR-9)", () => {
  it("空 profile では toggle が disabled + 「嗜好把握が足りない」 message", async () => {
    mockEmptyProfile();
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByTestId("opt-in-guard-message"),
    ).toHaveTextContent("嗜好把握が足りない");
  });

  it("eligible (signal_total >= min_required) なら toggle enabled", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(
      screen.queryByTestId("opt-in-guard-message"),
    ).not.toBeInTheDocument();
  });
});

// ============================================================
// Toggle interaction
// ============================================================
describe("OptInCard toggle interaction (US-2.1)", () => {
  it("toggle ON でアクセスする POST /opt-in が呼ばれ aria-checked=true へ", async () => {
    const user = userEvent.setup();
    let optInCalled = false;
    let getCalled = 0;
    server.use(
      http.get("http://localhost:8000/v1/persona-pool/me", () => {
        getCalled += 1;
        // 1 回目: opted_in=false、2 回目 (mutation 後 invalidation): opted_in=true
        return HttpResponse.json({
          opted_in: getCalled > 1,
          preview: SAMPLE_PREVIEW,
          guard: { signal_total: 4, min_required: 3, is_eligible: true },
        });
      }),
      http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
        HttpResponse.json({ today_count: 0, all_time_count: 0 }),
      ),
      http.post("http://localhost:8000/v1/persona-pool/opt-in", () => {
        optInCalled = true;
        return HttpResponse.json({
          ...SAMPLE_PREVIEW,
        });
      }),
    );

    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);
    await waitFor(() => expect(optInCalled).toBe(true));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  it("toggle OFF (opt-out) で DELETE /opt-in が呼ばれる", async () => {
    const user = userEvent.setup();
    let optOutCalled = false;
    let getCalled = 0;
    server.use(
      http.get("http://localhost:8000/v1/persona-pool/me", () => {
        getCalled += 1;
        return HttpResponse.json({
          opted_in: getCalled === 1, // 1 回目: ON、2 回目 (mutation 後): OFF
          preview: SAMPLE_PREVIEW,
          guard: { signal_total: 4, min_required: 3, is_eligible: true },
        });
      }),
      http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
        HttpResponse.json({ today_count: 3, all_time_count: 9 }),
      ),
      http.delete("http://localhost:8000/v1/persona-pool/opt-in", () => {
        optOutCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    await user.click(toggle);
    await waitFor(() => expect(optOutCalled).toBe(true));
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("opt-in 422 (insufficient signals) で inline error が isInsufficientSignalsError hint を表示", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("http://localhost:8000/v1/persona-pool/me", () =>
        HttpResponse.json({
          opted_in: false,
          // edge case: guard.is_eligible=true (frontend cache が古い) でも server が 422 返す
          preview: SAMPLE_PREVIEW,
          guard: { signal_total: 4, min_required: 3, is_eligible: true },
        }),
      ),
      http.get("http://localhost:8000/v1/persona-pool/me/citations", () =>
        HttpResponse.json({ today_count: 0, all_time_count: 0 }),
      ),
      http.post("http://localhost:8000/v1/persona-pool/opt-in", () =>
        HttpResponse.json(
          {
            detail: {
              code: "insufficient_profile_signals",
              signal_total: 1,
              min_required: 3,
              hint: "嗜好把握が足りないので公開できません",
            },
          },
          { status: 422 },
        ),
      ),
    );
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);
    expect(
      await screen.findByTestId("opt-in-inline-error"),
    ).toHaveTextContent("嗜好把握が足りない");
  });
});

// ============================================================
// US-2.2: 「今日 N 件」 server-side count
// ============================================================
describe("OptInCard citations (US-2.2)", () => {
  it("opt-in ON 時に 「今日 N 件の決め事に登場しました」 が表示される", async () => {
    mockOptedIn();
    render(<OptInCard />, { wrapper });
    expect(
      await screen.findByTestId("opt-in-today-count"),
    ).toHaveTextContent("今日 5 件");
  });

  it("opt-in OFF では citation count は表示しない", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    await screen.findByTestId("opt-in-preview");
    expect(
      screen.queryByTestId("opt-in-today-count"),
    ).not.toBeInTheDocument();
  });
});

// ============================================================
// a11y
// ============================================================
describe("OptInCard a11y", () => {
  it("toggle は role=switch + aria-checked", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    expect(toggle).toHaveAttribute("role", "switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("h2 heading で section title", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    expect(
      await screen.findByRole("heading", { level: 2 }),
    ).toHaveTextContent("他の人の 決め事に 参加する");
  });

  // I-1 fix (Task 7 ultrathink): WCAG 2.5.5 touch target 44×44
  it("I-1 fix: toggle button の hit area が 44×44 (h-11 w-11)", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    // tailwind class verify (h-11 w-11 = 44×44 px)
    expect(toggle.className).toContain("h-11");
    expect(toggle.className).toContain("w-11");
  });

  // I-2 fix (Task 7 ultrathink): aria-labelledby で h2 と紐付け
  it("I-2 fix: toggle に aria-labelledby='opt-in-card-title' (h2 と紐付け)", async () => {
    mockEligibleNotOptedIn();
    render(<OptInCard />, { wrapper });
    const toggle = await screen.findByTestId("opt-in-toggle");
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(toggle).toHaveAttribute("aria-labelledby", "opt-in-card-title");
    expect(h2).toHaveAttribute("id", "opt-in-card-title");
    expect(toggle).toHaveAttribute("aria-describedby", "opt-in-card-desc");
  });
});
