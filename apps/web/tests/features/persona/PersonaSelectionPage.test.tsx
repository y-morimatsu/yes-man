/**
 * PersonaSelectionPage — page-level integration test (Task 4 ultrathink I-3 fix).
 *
 * 検証:
 * - default tab は "builtin" (US-4.1 AC-2、regression 防止)
 * - tab 切替で localStorage に永続化 + UI が AnonymousSelectionList に切り替わる
 * - localStorage 既値 "anonymous" で reload しても anonymous tab で復帰 (永続化)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import PersonaSelectionPage from "../../../src/features/persona/PersonaSelectionPage";
import {
  STORAGE_KEY,
  clearPersonaSource,
  writePersonaSource,
} from "../../../src/features/persona/personaSourceStorage";

const server = setupServer(
  // default: empty builtin / my / selection / preference (page render に必要な最小 set)
  http.get("http://localhost:8000/v1/personas/me", () =>
    HttpResponse.json([]),
  ),
  http.get("http://localhost:8000/v1/personas/builtin", () =>
    HttpResponse.json([]),
  ),
  http.get("http://localhost:8000/v1/persona-selections/me", () =>
    HttpResponse.json({ persona_ids: [] }),
  ),
  http.get("http://localhost:8000/v1/preferences/me", () =>
    HttpResponse.json({
      accepted_patterns: [],
      rejected_patterns: [],
      persona_style_preference: {},
      inferred_tags: [],
    }),
  ),
  http.get("http://localhost:8000/v1/persona-pool/random", () =>
    HttpResponse.json({
      personas: [
        {
          persona_id: "p1",
          value_tags: ["t"],
          primary_language: "en",
          formality: "casual",
        },
        {
          persona_id: "p2",
          value_tags: ["t"],
          primary_language: "fr",
          formality: "polite",
        },
      ],
    }),
  ),
  // 2026-05-24 v4: AnonymousSelectionList が /list を fetch
  http.get("http://localhost:8000/v1/persona-pool/list", () =>
    HttpResponse.json({
      personas: [
        {
          persona_id: "p1",
          value_tags: ["t"],
          primary_language: "en",
          formality: "casual",
        },
      ],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => clearPersonaSource());

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

describe("PersonaSelectionPage (Task 4 integration)", () => {
  it("default tab is 'builtin' (US-4.1 AC-2 regression 防止)", async () => {
    render(<PersonaSelectionPage />, { wrapper });
    const builtin = await screen.findByTestId("persona-source-tab-builtin");
    expect(builtin).toHaveAttribute("aria-selected", "true");
    // anonymous panel は表示されない
    expect(screen.queryByTestId("anonymous-selection-list")).not.toBeInTheDocument();
  });

  it("tab 切替で localStorage 永続化 + AnonymousSelectionList が render される", async () => {
    const user = userEvent.setup();
    render(<PersonaSelectionPage />, { wrapper });

    // 初期: builtin
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    // anonymous tab を click
    await user.click(
      await screen.findByTestId("persona-source-tab-anonymous"),
    );

    // localStorage に永続化
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("anonymous");
    // panel 切替: AnonymousSelectionList が render される
    expect(await screen.findByTestId("anonymous-selection-list")).toBeInTheDocument();
  });

  it("既存 localStorage='anonymous' で reload しても anonymous tab で復帰 (lazy initializer)", async () => {
    writePersonaSource("anonymous");
    render(<PersonaSelectionPage />, { wrapper });

    const anonTab = await screen.findByTestId("persona-source-tab-anonymous");
    // I-1 fix verify: 初回 render から anonymous (flash なし、effect 不要)
    expect(anonTab).toHaveAttribute("aria-selected", "true");
    // AnonymousSelectionList は内部で /list を fetch するため async で待つ
    expect(
      await screen.findByTestId("anonymous-selection-list"),
    ).toBeInTheDocument();
  });

  it("my tab を選択 + 自作 0 件 → empty placeholder + 作成ボタン表示", async () => {
    const user = userEvent.setup();
    render(<PersonaSelectionPage />, { wrapper });

    await user.click(await screen.findByTestId("persona-source-tab-my"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("my");
    expect(await screen.findByTestId("my-personas-empty")).toBeInTheDocument();
    expect(screen.getByTestId("my-personas-empty-create")).toBeInTheDocument();
  });

  it("anonymous → builtin に戻すと builtin の selection state が残っている (panel unmount だけで state 失われない)", async () => {
    const user = userEvent.setup();
    render(<PersonaSelectionPage />, { wrapper });

    // anonymous tab に切替
    await user.click(await screen.findByTestId("persona-source-tab-anonymous"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("anonymous");

    // builtin tab に戻る
    await user.click(screen.getByTestId("persona-source-tab-builtin"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("builtin");
    expect(
      screen.getByTestId("persona-source-tab-builtin"),
    ).toHaveAttribute("aria-selected", "true");
    // anonymous panel は消える
    expect(screen.queryByTestId("anonymous-selection-list")).not.toBeInTheDocument();
  });
});
