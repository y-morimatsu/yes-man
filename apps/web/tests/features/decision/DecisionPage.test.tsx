import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import DecisionPage from "../../../src/features/decision/DecisionPage";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <DecisionPage />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionPage", () => {
  it("renders title + input + start button", () => {
    setup();
    expect(screen.getByRole("heading", { name: /何を きめますか/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/今日/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /送信/ })).toBeInTheDocument();
  });

  it("start button disabled when input is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: /送信/ })).toBeDisabled();
  });
});
