/**
 * ChoiceButtons — composite (FD §4.3、ultrathink I1 で SwipeYesNo から rename).
 *
 * MVP は 2 ボタン実装、gesture なし。将来 SwipeChoice を別 component で追加可能.
 */
import { Button } from "../primitives/Button";

export interface ChoiceButtonsProps {
  onYes: () => void;
  onNo: () => void;
  proposalText: string;
  disabled?: boolean;
}

export function ChoiceButtons({
  onYes,
  onNo,
  proposalText,
  disabled,
}: ChoiceButtonsProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-decision text-center font-medium">{proposalText}</p>
      <div className="flex gap-4">
        {/* INCEPTION §1.2: No 抑制 cool grey (muted)、Yes 強調 暖色グリーン (success) */}
        <Button
          variant="muted"
          size="lg"
          onClick={onNo}
          disabled={disabled}
          aria-label="No、提案を拒否"
        >
          No
        </Button>
        <Button
          variant="success"
          size="lg"
          onClick={onYes}
          disabled={disabled}
          aria-label="Yes、提案を採択"
        >
          Yes
        </Button>
      </div>
    </div>
  );
}
