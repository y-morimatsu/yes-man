import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@yesman/ui";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { BasicAttributesCard } from "../../../src/features/profile/BasicAttributesCard";
import type { Profile } from "@yesman/api-client";

const server = setupServer();

function renderCard(profile: Profile | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <BasicAttributesCard profile={profile} />
          </ToastProvider>
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}

const EMPTY: Profile = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "test@example.com",
  age_group: null,
  occupation: null,
  value_tags: [],
  gender: [],
  preferences: {},
  life_stage: null,
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
};

const FILLED: Profile = {
  ...EMPTY,
  age_group: "30代",
  occupation: "PdM",
  value_tags: ["効率重視", "慎重"],
  gender: ["女性"],
  life_stage: "社会人",
};

describe("BasicAttributesCard — ViewMode", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("空 profile では placeholder を表示する", () => {
    renderCard(EMPTY);
    expect(screen.getByText("基本属性")).toBeInTheDocument();
    expect(screen.getAllByText(/未設定|20代 \/ 30代/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
  });

  it("値が入った profile は各フィールドを表示する", () => {
    renderCard(FILLED);
    expect(screen.getByText("30代")).toBeInTheDocument();
    expect(screen.getByText("PdM")).toBeInTheDocument();
    expect(screen.getByText("効率重視 / 慎重")).toBeInTheDocument();
    expect(screen.getByText("女性")).toBeInTheDocument();
    expect(screen.getByText("社会人")).toBeInTheDocument();
  });
});

describe("BasicAttributesCard — EditMode toggle", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("[編集] クリックで edit 用 form 要素が出現する", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByRole("combobox", { name: /年齢層/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /職業/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });

  it("Edit mode の初期値は profile の現在値で初期化される", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    expect(ageSelect.value).toBe("30代");

    const occupationInput = screen.getByRole("textbox", { name: /職業/ }) as HTMLInputElement;
    expect(occupationInput.value).toBe("PdM");

    const lifeStageSelect = screen.getByRole("combobox", { name: /ライフステージ/ }) as HTMLSelectElement;
    expect(lifeStageSelect.value).toBe("社会人");
  });
});

describe("BasicAttributesCard — Edit interactions", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("select 変更で draft 値が更新される (age_group)", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    await user.selectOptions(ageSelect, "40代");
    expect(ageSelect.value).toBe("40代");
  });

  it("text input 変更で occupation が更新される", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const occInput = screen.getByRole("textbox", { name: /職業/ }) as HTMLInputElement;
    await user.type(occInput, "Engineer");
    expect(occInput.value).toBe("Engineer");
  });

  it("preset chip クリックで value_tags が toggle される", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const chip = screen.getByRole("button", { name: "効率重視", pressed: false });
    await user.click(chip);
    expect(screen.getByRole("button", { name: "効率重視", pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "効率重視", pressed: true }));
    expect(screen.getByRole("button", { name: "効率重視", pressed: false })).toBeInTheDocument();
  });

  it("カスタムタグを追加できる (Enter / [追加] button)", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const customInput = screen.getByRole("textbox", { name: "カスタムタグを追加" });
    await user.type(customInput, "ミニマリスト{Enter}");

    expect(screen.getByRole("button", { name: "ミニマリスト", pressed: true })).toBeInTheDocument();
  });

  it("性別 chip は単一選択 — 別の chip クリックで前の選択が解除される", async () => {
    const user = userEvent.setup();
    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));

    // 男性 chip をクリック
    await user.click(screen.getByRole("button", { name: "男性", pressed: false }));
    expect(screen.getByRole("button", { name: "男性", pressed: true })).toBeInTheDocument();

    // 女性 chip をクリック → 男性は解除、女性のみ選択
    await user.click(screen.getByRole("button", { name: "女性", pressed: false }));
    expect(screen.getByRole("button", { name: "女性", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "男性", pressed: false })).toBeInTheDocument();

    // 女性 chip を再クリック → 解除 (空選択)
    await user.click(screen.getByRole("button", { name: "女性", pressed: true }));
    expect(screen.getByRole("button", { name: "女性", pressed: false })).toBeInTheDocument();
  });
});

describe("BasicAttributesCard — Save success", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("[保存] click で PATCH /v1/profiles/me が呼ばれ ViewMode に戻る", async () => {
    const user = userEvent.setup();
    let received: Record<string, unknown> | null = null;
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...FILLED,
          age_group: "40代",
        });
      }),
    );

    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ });
    await user.selectOptions(ageSelect, "40代");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("button", { name: "編集" });

    expect(received).toMatchObject({ age_group: "40代" });
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
  });

  it("空文字フィールドは null に正規化されて送信される", async () => {
    const user = userEvent.setup();
    let received: Record<string, unknown> | null = null;
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(EMPTY);
      }),
    );

    renderCard(EMPTY);
    await user.click(screen.getByRole("button", { name: "編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("button", { name: "編集" });
    expect(received).toMatchObject({
      age_group: null,
      occupation: null,
      life_stage: null,
      value_tags: [],
      gender: [],
    });
  });
});

describe("BasicAttributesCard — Save failure", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("PATCH が 500 を返したら EditMode は維持され error toast が出る", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("http://localhost:8000/v1/profiles/me", () =>
        new HttpResponse(JSON.stringify({ detail: "internal" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/保存に失敗しました/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });
});

describe("BasicAttributesCard — Cancel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("編集中の変更を [キャンセル] で破棄し ViewMode に戻る", async () => {
    const user = userEvent.setup();
    renderCard(FILLED);
    await user.click(screen.getByRole("button", { name: "編集" }));

    const ageSelect = screen.getByRole("combobox", { name: /年齢層/ });
    await user.selectOptions(ageSelect, "40代");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(await screen.findByRole("button", { name: "編集" })).toBeInTheDocument();
    expect(screen.getByText("30代")).toBeInTheDocument();
    expect(screen.queryByText("40代")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "編集" }));
    const ageSelect2 = screen.getByRole("combobox", { name: /年齢層/ }) as HTMLSelectElement;
    expect(ageSelect2.value).toBe("30代");
  });
});
