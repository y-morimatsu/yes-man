import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../../src/primitives/Button";

describe("Button", () => {
  it("renders with default variant primary", () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole("button", { name: "Click" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-brand-600");
  });

  it("renders danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-danger");
  });

  it("renders size lg", () => {
    render(<Button size="lg">Big</Button>);
    const btn = screen.getByRole("button", { name: "Big" });
    expect(btn.className).toContain("h-12");
  });

  it("disables when loading", () => {
    render(<Button loading>Wait</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("disables when disabled prop true", () => {
    render(<Button disabled>X</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("doesn't call onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>X</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
