import { describe, expect, it, vi, beforeEach, afterAll, afterEach, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { ToastProvider } from "@yesman/ui";
import { DecisionResult } from "../../../src/features/decision/DecisionResult";

// canvas-confetti を mock (default export を vi.fn() に差替え)
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

import confetti from "canvas-confetti";

const server = setupServer();

function setup(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <DecisionResult
                utterances={[]}
                proposal="コンビニのサラダチキン定食"
                decisionId="test-id-1"
                onComplete={() => {}}
                onNoChosen={() => {}}
                {...props}
              />
            </ToastProvider>
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionResult — Yes confetti", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  beforeEach(() => {
    vi.mocked(confetti).mockClear();
  });

  it("fires confetti on Yes selection", async () => {
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );
    const { getByRole } = setup();
    const yesButton = getByRole("button", { name: /Yes/ });
    yesButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it("does not fire confetti on No selection", async () => {
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 1 }),
      ),
    );
    const { getByRole } = setup();
    const noButton = getByRole("button", { name: /No/ });
    noButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("does not fire confetti when prefers-reduced-motion is set", async () => {
    // Mock matchMedia to return reduce
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    try {
      server.use(
        http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
          HttpResponse.json({ no_attempt_count: 0 }),
        ),
      );
      const { getByRole } = setup();
      const yesButton = getByRole("button", { name: /Yes/ });
      yesButton.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(confetti).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("calls navigator.vibrate(50) on Yes selection", async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );
    const { getByRole } = setup();
    const yesButton = getByRole("button", { name: /Yes/ });
    yesButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(vibrateMock).toHaveBeenCalledWith(50);
  });

  it("does not call navigator.vibrate when prefers-reduced-motion is set", async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    try {
      server.use(
        http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
          HttpResponse.json({ no_attempt_count: 0 }),
        ),
      );
      const { getByRole } = setup();
      const yesButton = getByRole("button", { name: /Yes/ });
      yesButton.click();
      await new Promise((r) => setTimeout(r, 50));
      // SwipeChoice may call vibrate(20) for its own haptic; assert our 50ms pulse was NOT fired
      expect(vibrateMock).not.toHaveBeenCalledWith(50);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
