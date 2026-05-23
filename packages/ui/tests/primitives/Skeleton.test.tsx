import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "../../src/primitives/Skeleton";

describe("Skeleton", () => {
  it("renders a rounded pulse box by default", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("rounded-lg");
    expect(el.className).toContain("bg-neutral-200");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("motion-reduce:animate-none");
  });

  it("merges className prop", () => {
    const { container } = render(<Skeleton className="h-12 w-48" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-12");
    expect(el.className).toContain("w-48");
  });

  it("applies inline style prop", () => {
    const { container } = render(<Skeleton style={{ width: 200, height: 80 }} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("80px");
  });

  it("has aria-hidden=true", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});
