/**
 * MangaBubble — v3-γ anonymous-strangers Task 5.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MangaBubble } from "../../src/composites/MangaBubble";

describe("MangaBubble", () => {
  it("size='large' has full opacity + box-shadow", () => {
    render(
      <MangaBubble size="large" tail="center">
        hello
      </MangaBubble>,
    );
    const bubble = screen.getByTestId("manga-bubble");
    expect(bubble).toHaveAttribute("data-bubble-size", "large");
    expect(bubble).toHaveStyle({ opacity: "1" });
  });

  it("size='small' has reduced opacity (0.3) for past speaker fade", () => {
    render(
      <MangaBubble size="small" tail="left">
        prior
      </MangaBubble>,
    );
    const bubble = screen.getByTestId("manga-bubble");
    expect(bubble).toHaveAttribute("data-bubble-size", "small");
    expect(bubble).toHaveStyle({ opacity: "0.3" });
  });

  it("Arabic language applies lang-ar class + dir=rtl when rtl=true", () => {
    render(
      <MangaBubble size="large" language="ar" rtl>
        أهلاً
      </MangaBubble>,
    );
    const content = screen.getByTestId("manga-bubble-content");
    expect(content).toHaveClass("lang-ar");
    expect(content).toHaveAttribute("dir", "rtl");
  });

  it("Chinese language applies lang-zh class without dir=rtl", () => {
    render(
      <MangaBubble size="large" language="zh">
        你好
      </MangaBubble>,
    );
    const content = screen.getByTestId("manga-bubble-content");
    expect(content).toHaveClass("lang-zh");
    expect(content).not.toHaveAttribute("dir");
  });

  it("Japanese (default) has no lang class", () => {
    render(
      <MangaBubble size="large" language="ja">
        こんにちは
      </MangaBubble>,
    );
    const content = screen.getByTestId("manga-bubble-content");
    expect(content).not.toHaveClass("lang-ar");
    expect(content).not.toHaveClass("lang-zh");
  });

  it("custom testId is honored", () => {
    render(
      <MangaBubble size="large" testId="custom-bub">
        x
      </MangaBubble>,
    );
    expect(screen.getByTestId("custom-bub")).toBeInTheDocument();
  });
});
