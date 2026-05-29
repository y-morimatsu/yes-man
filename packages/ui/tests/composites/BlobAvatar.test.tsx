/**
 * BlobAvatar — v3-γ anonymous-strangers Task 5.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlobAvatar } from "../../src/composites/BlobAvatar";

describe("BlobAvatar", () => {
  it("renders with default props (orange / 44 / center gaze)", () => {
    render(<BlobAvatar name="test" />);
    const el = screen.getByTestId("blob-avatar");
    expect(el).toHaveAttribute("aria-label", "test");
    expect(el).toHaveAttribute("data-blob-color", "orange");
    expect(el).toHaveAttribute("data-blob-size", "44");
    expect(el).toHaveAttribute("data-blob-gaze", "center");
  });

  it("size variant changes width/height inline style", () => {
    const { rerender } = render(<BlobAvatar size={28} name="t" />);
    expect(screen.getByTestId("blob-avatar")).toHaveStyle({
      width: "28px",
      height: "28px",
    });
    rerender(<BlobAvatar size={80} name="t" />);
    expect(screen.getByTestId("blob-avatar")).toHaveStyle({
      width: "80px",
      height: "80px",
    });
  });

  it("dim=true reduces opacity to 0.32 (mockup `.dim` 仕様)", () => {
    render(<BlobAvatar dim name="t" />);
    expect(screen.getByTestId("blob-avatar")).toHaveStyle({ opacity: "0.32" });
  });

  it("renders 2 eyes (aria-hidden inner spans)", () => {
    const { container } = render(<BlobAvatar name="t" />);
    const eyes = container.querySelectorAll('[aria-hidden="true"]');
    expect(eyes).toHaveLength(2);
  });

  it("all 4 color variants render with distinct data-blob-color", () => {
    const colors = ["green", "orange", "blue", "pink"] as const;
    for (const c of colors) {
      const { unmount } = render(<BlobAvatar color={c} name={c} />);
      expect(screen.getByTestId("blob-avatar")).toHaveAttribute(
        "data-blob-color",
        c,
      );
      unmount();
    }
  });
});
