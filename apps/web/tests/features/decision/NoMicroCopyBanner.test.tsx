/**
 * issue #93: NoMicroCopyBanner dynamic message + stage fallback の verify.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoMicroCopyBanner } from "../../../src/features/decision/NoMicroCopyBanner";

describe("NoMicroCopyBanner", () => {
  it("stage <= 0 では何も render しない", () => {
    const { container } = render(<NoMicroCopyBanner stage={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stage=1 の static fallback は新文言 (issue #93 修正後)", () => {
    render(<NoMicroCopyBanner stage={1} />);
    // 旧 "別案を生成中…" は出ない
    expect(screen.queryByText(/別案を生成中…$/)).not.toBeInTheDocument();
    expect(screen.getByText(/もう一案 どうぞ/)).toBeInTheDocument();
  });

  it("dynamicMessage が指定されたら static fallback より優先表示", () => {
    render(
      <NoMicroCopyBanner
        stage={1}
        dynamicMessage="LLM 生成: もう一案 どうぞ、 これなら きっと"
      />,
    );
    expect(
      screen.getByText("LLM 生成: もう一案 どうぞ、 これなら きっと"),
    ).toBeInTheDocument();
    // fallback は出ない
    expect(screen.queryByText("もう一案 どうぞ")).not.toBeInTheDocument();
  });

  it("dynamicMessage=null は static fallback を使う", () => {
    render(<NoMicroCopyBanner stage={2} dynamicMessage={null} />);
    expect(screen.getByText(/もう一度考えてみては/)).toBeInTheDocument();
  });

  it("regenerating=true で「別案を生成中…」 補助行が追加表示", () => {
    render(
      <NoMicroCopyBanner
        stage={1}
        regenerating
        dynamicMessage="軽い前向き"
      />,
    );
    // 主 microcopy + 補助行
    expect(screen.getByText("軽い前向き")).toBeInTheDocument();
    expect(screen.getByText(/別案を生成中… \(LiteLLM 応答待ち\)/)).toBeInTheDocument();
  });

  it("stage に応じて border 強度が変わる (stage>=3 は warning)", () => {
    const { container } = render(<NoMicroCopyBanner stage={3} />);
    const banner = container.querySelector("[data-testid='no-microcopy-banner']");
    expect(banner?.className).toContain("border-warning");
  });
});
