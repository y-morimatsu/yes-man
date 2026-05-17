import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PersonaCard } from "../../src/composites/PersonaCard";

const samplePersona = {
  id: "p1",
  name: "効率派",
  description: "効率重視",
  usage_count: 10,
  yes_acceptance_rate: 0.5,
};

describe("PersonaCard", () => {
  it("renders persona name and description (full variant default)", () => {
    render(<PersonaCard persona={samplePersona} />);
    expect(screen.getByText("効率派")).toBeInTheDocument();
    expect(screen.getByText("効率重視")).toBeInTheDocument();
  });

  it("does not render description in compact variant", () => {
    render(<PersonaCard persona={samplePersona} variant="compact" />);
    expect(screen.getByText("効率派")).toBeInTheDocument();
    expect(screen.queryByText("効率重視")).not.toBeInTheDocument();
  });

  it("calls onClick when card clicked", () => {
    const onClick = vi.fn();
    render(<PersonaCard persona={samplePersona} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders anonymous creator id when present", () => {
    render(
      <PersonaCard
        persona={{ ...samplePersona, creator_anonymous_id: "yesman-abc123" }}
      />,
    );
    expect(screen.getByText(/yesman-abc123/)).toBeInTheDocument();
  });

  it("applies opacity-50 when blocked", () => {
    const { container } = render(
      <PersonaCard persona={{ ...samplePersona, is_blocked: true }} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("opacity-50");
  });
});
