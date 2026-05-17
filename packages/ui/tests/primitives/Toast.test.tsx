import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToastContext } from "../../src/primitives/ToastProvider";

function TestComponent() {
  const { push } = useToastContext();
  return (
    <button onClick={() => push({ message: "Hello", variant: "success" })}>
      push
    </button>
  );
}

describe("ToastProvider + useToastContext", () => {
  it("provides push function via context", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    expect(screen.getByText("push")).toBeInTheDocument();
  });

  it("throws when used outside ToastProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(/within ToastProvider/);
    consoleError.mockRestore();
  });

  it("renders toast after push", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText("push").click();
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
