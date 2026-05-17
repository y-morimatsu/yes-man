import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import PreferencePage from "../../../src/features/preference/PreferencePage";

const server = setupServer();

interface PreferencePayload {
  user_id: string;
  accepted_patterns: unknown[];
  rejected_patterns: unknown[];
  persona_style_preference: Record<string, number>;
  inferred_tags: string[];
  last_updated_at: string;
}

function setup(payload: PreferencePayload) {
  server.use(
    http.get("http://localhost:8000/v1/preferences/me", () =>
      HttpResponse.json(payload),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>
          <PreferencePage />
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}

const BASE: PreferencePayload = {
  user_id: "11111111-1111-1111-1111-111111111111",
  accepted_patterns: [],
  rejected_patterns: [],
  persona_style_preference: {},
  inferred_tags: [],
  last_updated_at: "2026-05-16T00:00:00Z",
};

describe("PreferencePage", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders page title + reset button after data loads", async () => {
    setup(BASE);
    await waitFor(() => {
      expect(screen.getByText("嗜好プロファイル")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "リセット" }),
    ).toBeInTheDocument();
  });

  it("renders persona_style_preference values", async () => {
    setup({
      ...BASE,
      persona_style_preference: {
        慎重派: 0.5,
        楽観派: -0.25,
      },
    });
    await waitFor(() => {
      expect(screen.getByText("慎重派")).toBeInTheDocument();
    });
    expect(screen.getByText("0.50")).toBeInTheDocument();
    expect(screen.getByText("-0.25")).toBeInTheDocument();
  });
});
