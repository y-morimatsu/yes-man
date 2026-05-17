import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoiceMicButton } from "../../src/composites/VoiceMicButton";

describe("VoiceMicButton", () => {
  it("renders idle state with '話す' label", () => {
    render(<VoiceMicButton state="idle" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /話す/ })).toBeInTheDocument();
  });

  it("renders recording state with aria-pressed=true", () => {
    render(<VoiceMicButton state="recording" onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: /録音中/ });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders processing state with loading", () => {
    render(<VoiceMicButton state="processing" onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("renders error state with error message", () => {
    render(
      <VoiceMicButton
        state="error"
        onClick={() => {}}
        errorMessage="聞き取り失敗"
      />,
    );
    expect(screen.getByRole("button", { name: /再試行/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("聞き取り失敗");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<VoiceMicButton state="idle" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
