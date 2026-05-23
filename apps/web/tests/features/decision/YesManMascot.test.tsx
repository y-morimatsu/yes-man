/**
 * YesManMascot unit test.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { YesManMascot } from "../../../src/features/decision/YesManMascot";

describe("YesManMascot", () => {
  it("state=hidden では何も render しない", () => {
    const { container } = render(<YesManMascot state="hidden" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("state=streaming で「じっくり 考え中」を表示", () => {
    render(<YesManMascot state="streaming" />);
    expect(screen.getByText(/じっくり 考え中/)).toBeInTheDocument();
  });

  it("state=proposing で「迷ったら 任せて」を表示", () => {
    render(<YesManMascot state="proposing" />);
    expect(screen.getByText(/迷ったら 任せて/)).toBeInTheDocument();
  });

  it("state=yes で祝福メッセージ", () => {
    render(<YesManMascot state="yes" />);
    expect(screen.getByText(/やった/)).toBeInTheDocument();
  });

  it("state=no で励ましメッセージ", () => {
    render(<YesManMascot state="no" />);
    expect(screen.getByText(/次は うまくいくよ/)).toBeInTheDocument();
  });

  it("state=silenced で抑制トーン", () => {
    render(<YesManMascot state="silenced" />);
    expect(screen.getByText(/あなたが 決める領域/)).toBeInTheDocument();
  });

  it("data-ym-mascot-state 属性が state を反映", () => {
    render(<YesManMascot state="yes" />);
    expect(screen.getByTestId("yesman-mascot").getAttribute("data-ym-mascot-state")).toBe("yes");
  });

  it("マスコット絵文字 🤵 を含む", () => {
    render(<YesManMascot state="proposing" />);
    expect(screen.getByText("🤵")).toBeInTheDocument();
  });
});
