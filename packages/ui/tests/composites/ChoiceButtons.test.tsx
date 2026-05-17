import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChoiceButtons } from "../../src/composites/ChoiceButtons";

describe("ChoiceButtons", () => {
  it("renders proposal text", () => {
    render(<ChoiceButtons proposalText="食事は何にしますか" onYes={() => {}} onNo={() => {}} />);
    expect(screen.getByText("食事は何にしますか")).toBeInTheDocument();
  });

  it("calls onYes when Yes clicked", () => {
    const onYes = vi.fn();
    render(<ChoiceButtons proposalText="x" onYes={onYes} onNo={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes/ }));
    expect(onYes).toHaveBeenCalledOnce();
  });

  it("calls onNo when No clicked", () => {
    const onNo = vi.fn();
    render(<ChoiceButtons proposalText="x" onYes={() => {}} onNo={onNo} />);
    fireEvent.click(screen.getByRole("button", { name: /No/ }));
    expect(onNo).toHaveBeenCalledOnce();
  });

  it("disables both buttons when disabled prop true", () => {
    render(<ChoiceButtons proposalText="x" onYes={() => {}} onNo={() => {}} disabled />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((b) => expect(b).toBeDisabled());
  });
});
