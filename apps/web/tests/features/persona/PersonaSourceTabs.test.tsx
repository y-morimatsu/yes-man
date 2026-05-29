/**
 * PersonaSourceTabs — 2-tab UI tests (v3-γ Task 4).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonaSourceTabs } from "../../../src/features/persona/PersonaSourceTabs";

describe("PersonaSourceTabs", () => {
  it("renders both tabs with correct aria-selected", () => {
    render(<PersonaSourceTabs value="builtin" onChange={() => {}} />);
    const builtin = screen.getByTestId("persona-source-tab-builtin");
    const anon = screen.getByTestId("persona-source-tab-anonymous");
    expect(builtin).toHaveAttribute("aria-selected", "true");
    expect(anon).toHaveAttribute("aria-selected", "false");
  });

  it("anonymous tab is selected when value='anonymous'", () => {
    render(<PersonaSourceTabs value="anonymous" onChange={() => {}} />);
    expect(
      screen.getByTestId("persona-source-tab-anonymous"),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("persona-source-tab-builtin")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("tab click calls onChange with the new source", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PersonaSourceTabs value="builtin" onChange={onChange} />);
    await user.click(screen.getByTestId("persona-source-tab-anonymous"));
    expect(onChange).toHaveBeenCalledWith("anonymous");
  });

  it("tablist has accessible label", () => {
    render(<PersonaSourceTabs value="builtin" onChange={() => {}} />);
    expect(
      screen.getByRole("tablist", { name: /source 切替/ }),
    ).toBeInTheDocument();
  });

  it("each tab has aria-controls pointing to its panel", () => {
    render(<PersonaSourceTabs value="builtin" onChange={() => {}} />);
    expect(
      screen.getByTestId("persona-source-tab-builtin"),
    ).toHaveAttribute("aria-controls", "persona-panel-builtin");
    expect(
      screen.getByTestId("persona-source-tab-anonymous"),
    ).toHaveAttribute("aria-controls", "persona-panel-anonymous");
  });
});
