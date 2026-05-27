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

// =====================================================================
// 2026-05-26 drill-down-auto-open (FR-DAO-02/03/09 + NFR-DAO-06/10)
// =====================================================================
describe("DecisionResult — drill-down-auto-open (final 段 Yes 自動 open)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const SERVICE_AMAZON = {
    name: "Amazon Prime Video",
    url: "https://www.amazon.co.jp/gp/video/storefront",
    emoji: "📺",
  };

  it("isFinal=true && service≠null: Yes click で window.open(_blank, noopener,noreferrer) を発火", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    const { getByRole } = setup({
      isFinal: true,
      service: SERVICE_AMAZON,
      proposal: "『パターソン』を Amazon Prime Video で 開きますか?",
    });

    const yesBtn = getByRole("button", { name: /Yes/ });
    yesBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.amazon.co.jp/gp/video/storefront",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("isFinal=true && service=null: window.open は呼ばれない (FR-DAO-06)", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    const { getByRole } = setup({
      isFinal: true,
      service: null,
    });

    const yesBtn = getByRole("button", { name: /Yes/ });
    yesBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("isFinal=false (drill-down 中): window.open は呼ばれない (FR-DAO-05)", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const onDrillDown = vi.fn();

    const { getByRole } = setup({
      isFinal: false,
      service: SERVICE_AMAZON,
      onDrillDown,
    });

    const yesBtn = getByRole("button", { name: /Yes/ });
    yesBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    // isFinal=false なら onYesSync は SwipeChoice に渡されない (undefined) ので発火しない
    expect(openSpy).not.toHaveBeenCalled();
    // drill-down 経路では onDrillDown が呼ばれる
    expect(onDrillDown).toHaveBeenCalledOnce();
    openSpy.mockRestore();
  });

  it("isFinal=true && service≠null: Yes button aria-label に '新しいタブ' が含まれる (NFR-DAO-10)", () => {
    const { container } = setup({
      isFinal: true,
      service: SERVICE_AMAZON,
    });
    const yesBtn = container.querySelector(
      'button[aria-label*="新しいタブ"]',
    ) as HTMLButtonElement | null;
    expect(yesBtn).not.toBeNull();
    expect(yesBtn).toHaveAttribute(
      "aria-label",
      "Yes、提案を採択 (新しいタブで Amazon Prime Video を開きます)",
    );
  });

  it("isFinal=false: Yes button aria-label は default 'Yes、提案を採択'", () => {
    const { getByRole } = setup({ isFinal: false, service: SERVICE_AMAZON });
    const yesBtn = getByRole("button", { name: /Yes/ });
    expect(yesBtn).toHaveAttribute("aria-label", "Yes、提案を採択");
  });
});

// ============================================================
// 2026-05-26: confirm phase (Yes で外部サービスに飛ぶ前の category 別確認 step).
// ============================================================
describe("DecisionResult — confirm phase (post-final Yes 前の Yes/No 確認)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const SERVICE_FASHION = {
    name: "Amazon Fashion",
    url: "https://www.amazon.co.jp/fashion",
    emoji: "👔",
    category: "fashion",
  };
  const SERVICE_MOVIE = {
    name: "Amazon Prime Video",
    url: "https://www.amazon.co.jp/gp/video/storefront",
    emoji: "📺",
    category: "movie",
  };

  it("category=fashion で final Yes → confirm step (持っていないなら 買いますか?) が出る、window.open は呼ばれない", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const { getByRole, queryByTestId, findByText } = setup({
      isFinal: true,
      service: SERVICE_FASHION,
      proposal: "明日は 軽めのジャケット で 決まり!",
    });

    // 最初の Yes click → confirm step に遷移、popup は開かない
    getByRole("button", { name: /Yes/ }).click();
    await findByText("持っていないなら 買いますか?");
    expect(openSpy).not.toHaveBeenCalled();
    expect(queryByTestId("proposal-result-card-chosen")).toBeNull();
    openSpy.mockRestore();
  });

  it("category=fashion で 持っていないなら 買いますか? に Yes → window.open", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    const { getByRole, findByText } = setup({
      isFinal: true,
      service: SERVICE_FASHION,
      proposal: "明日は 軽めのジャケット で 決まり!",
    });

    // final Yes → confirm step
    getByRole("button", { name: /Yes/ }).click();
    await findByText("持っていないなら 買いますか?");

    // Yes → window.open + chosen=yes
    getByRole("button", { name: /Yes/ }).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(openSpy).toHaveBeenCalledWith(
      SERVICE_FASHION.url,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("category=fashion で 持っていないなら 買いますか? に No → stop banner、window.open は呼ばれない", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    const { getByRole, findByText, findByTestId, queryByTestId } = setup({
      isFinal: true,
      service: SERVICE_FASHION,
      proposal: "明日は 軽めのジャケット で 決まり!",
    });

    // final Yes → confirm step
    getByRole("button", { name: /Yes/ }).click();
    await findByText("持っていないなら 買いますか?");

    // No → stop
    getByRole("button", { name: /No/ }).click();
    await findByTestId("confirm-stop-banner");
    expect(openSpy).not.toHaveBeenCalled();
    expect(queryByTestId("external-service-cta")).toBeNull();
    openSpy.mockRestore();
  });

  it("category=movie で final Yes → 今 観ますか? → Yes で window.open (1 段だけの flow)", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    const { getByRole, findByText } = setup({
      isFinal: true,
      service: SERVICE_MOVIE,
      proposal: "『パターソン』を 観るので 決まり!",
    });

    // final Yes → 今 観ますか?
    getByRole("button", { name: /Yes/ }).click();
    await findByText("今 観ますか?");
    expect(openSpy).not.toHaveBeenCalled();

    // confirm Yes → window.open
    getByRole("button", { name: /Yes/ }).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(openSpy).toHaveBeenCalledWith(
      SERVICE_MOVIE.url,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("category 未定義 service: 旧経路 (Yes で即 window.open) を維持", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );

    // category なしの service object
    const SERVICE_NO_CAT = { ...SERVICE_FASHION };
    delete (SERVICE_NO_CAT as { category?: string }).category;

    const { getByRole } = setup({
      isFinal: true,
      service: SERVICE_NO_CAT,
      proposal: "服 で 決まり!",
    });

    getByRole("button", { name: /Yes/ }).click();
    await new Promise((r) => setTimeout(r, 50));

    expect(openSpy).toHaveBeenCalledWith(
      SERVICE_NO_CAT.url,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
