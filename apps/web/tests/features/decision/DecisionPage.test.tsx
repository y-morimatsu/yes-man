import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import DecisionPage from "../../../src/features/decision/DecisionPage";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>
          <DecisionPage />
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}

describe("DecisionPage", () => {
  it("renders title + input + start button", () => {
    setup();
    expect(screen.getByRole("heading", { name: /合議で決定/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/決めたいことを入力/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /合議開始/ })).toBeInTheDocument();
  });

  it("start button disabled when input is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: /合議開始/ })).toBeDisabled();
  });
});
