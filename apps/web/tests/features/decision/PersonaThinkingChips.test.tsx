import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonaThinkingChips } from "../../../src/features/decision/PersonaThinkingChips";
import type { Utterance } from "../../../src/features/decision/reducer";

function makeUtterance(persona_name: string, text = "..."): Utterance {
  return {
    persona_id: persona_name,
    persona_name,
    text,
  };
}

describe("PersonaThinkingChips", () => {
  it("renders all 3 personas as thinking when utterances empty", () => {
    render(<PersonaThinkingChips utterances={[]} />);
    expect(screen.getAllByText(/考え中/)).toHaveLength(3);
    expect(screen.getByText(/🛡️/)).toBeInTheDocument();
    expect(screen.getByText(/☀️/)).toBeInTheDocument();
    expect(screen.getByText(/⚡/)).toBeInTheDocument();
  });

  it("marks cautious as done when 慎重派 utterance arrives", () => {
    render(
      <PersonaThinkingChips
        utterances={[makeUtterance("慎重派")]}
      />,
    );
    expect(screen.getByText(/✓ 慎重派/)).toBeInTheDocument();
    expect(screen.getAllByText(/考え中/)).toHaveLength(2);
  });

  it("marks all 3 as done when all utterances arrived", () => {
    render(
      <PersonaThinkingChips
        utterances={[
          makeUtterance("慎重派"),
          makeUtterance("楽観派"),
          makeUtterance("効率派"),
        ]}
      />,
    );
    expect(screen.getByText(/✓ 慎重派/)).toBeInTheDocument();
    expect(screen.getByText(/✓ 楽観派/)).toBeInTheDocument();
    expect(screen.getByText(/✓ 効率派/)).toBeInTheDocument();
    expect(screen.queryByText(/考え中/)).not.toBeInTheDocument();
  });

  it("applies animate-pulse class to thinking chips only", () => {
    const { container } = render(<PersonaThinkingChips utterances={[]} />);
    const pulsing = container.querySelectorAll(".animate-pulse");
    expect(pulsing.length).toBe(3);
  });
});
