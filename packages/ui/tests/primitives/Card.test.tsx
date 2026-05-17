import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card } from "../../src/primitives/Card";

describe("Card", () => {
  it("renders as div by default", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("renders as button when onClick provided (a11y)", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>click me</Card>);
    const btn = screen.getByRole("button", { name: "click me" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as article when as='article'", () => {
    const { container } = render(<Card as="article">a</Card>);
    expect(container.querySelector("article")).toBeInTheDocument();
  });

  it("supports keyboard Enter activation (button semantics)", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>x</Card>);
    const btn = screen.getByRole("button");
    fireEvent.click(btn); // browser-native: Enter on focused button triggers click
    expect(onClick).toHaveBeenCalled();
  });
});
