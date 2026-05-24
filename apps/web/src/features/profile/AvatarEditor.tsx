/**
 * AvatarEditor — 2026-05-24: avatar カスタマイズ UI (色 + 絵文字 + 将来画像).
 *
 * mode tab で 2 種類を切替: 色 (gradient 8 色 + 頭文字) / 絵文字 (preset 12 + custom 入力).
 * preview を即時表示、value は controlled (caller の draft state を更新).
 */
import { useCallback } from "react";
import { Input } from "@yesman/ui";
import { Avatar, type AvatarConfig, type AvatarMode } from "./Avatar";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_KEYS,
  EMOJI_PRESETS,
  colorGradient,
  type AvatarColorKey,
} from "./avatarColors";

export interface AvatarEditorProps {
  /** current avatar config (caller の draft). */
  value: AvatarConfig;
  /** caller への変更通知. */
  onChange: (next: AvatarConfig) => void;
  /** preview に使う display_name の頭文字 fallback. */
  fallbackLetter: string;
}

export function AvatarEditor({ value, onChange, fallbackLetter }: AvatarEditorProps) {
  // mode 切替時、関連 field を clear せず保持 (再切替で値復元できるよう draft 内に残す).
  const setMode = useCallback(
    (mode: AvatarMode) => {
      onChange({ ...value, mode });
    },
    [value, onChange],
  );

  const setColor = useCallback(
    (color: AvatarColorKey) => {
      onChange({ ...value, color });
    },
    [value, onChange],
  );

  const setEmoji = useCallback(
    (emoji: string) => {
      onChange({ ...value, emoji });
    },
    [value, onChange],
  );

  const currentMode: AvatarMode = value.mode ?? "default";
  // default mode は色 tab の subset として表示 (color 未指定 = green と等価)
  const activeTab: "color" | "emoji" = currentMode === "emoji" ? "emoji" : "color";

  return (
    <div className="flex flex-col gap-3" data-testid="avatar-editor">
      {/* Preview */}
      <div className="flex items-center gap-3">
        <Avatar size={56} config={value} fallbackLetter={fallbackLetter} />
        <div className="text-xs text-neutral-600">
          <p className="font-semibold">アバター preview</p>
          <p className="text-[10px] text-neutral-500">
            保存すると profile / home で反映されます
          </p>
        </div>
      </div>

      {/* Mode tab */}
      <div
        className="flex gap-1 rounded-lg p-1"
        style={{ background: "rgba(46, 36, 24, 0.05)" }}
        role="tablist"
        aria-label="アバター mode 切替"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "color"}
          data-testid="avatar-tab-color"
          onClick={() =>
            setMode(currentMode === "default" ? "color" : currentMode === "emoji" ? "color" : "color")
          }
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "color"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          色 + 頭文字
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "emoji"}
          data-testid="avatar-tab-emoji"
          onClick={() => setMode("emoji")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "emoji"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          絵文字
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          disabled
          className="flex-1 rounded-md px-3 py-1.5 text-xs text-neutral-300 cursor-not-allowed"
          title="Phase 2"
        >
          画像 (準備中)
        </button>
      </div>

      {/* Color tab content */}
      {activeTab === "color" && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="色を選ぶ">
          {AVATAR_COLOR_KEYS.map((key) => {
            const selected = (value.color ?? "green") === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={AVATAR_COLORS[key].label}
                data-testid={`avatar-color-${key}`}
                onClick={() => setColor(key)}
                className={`inline-flex items-center justify-center rounded-full transition-transform ${
                  selected
                    ? "ring-2 ring-offset-2 ring-orange-500 scale-110"
                    : "hover:scale-105"
                }`}
                style={{
                  width: 36,
                  height: 36,
                  background: colorGradient(key),
                  border: "1.5px solid #FFFCF4",
                }}
              >
                {selected && <span className="text-white text-sm font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji tab content */}
      {activeTab === "emoji" && (
        <div className="flex flex-col gap-2">
          {/* preset grid (4×3) */}
          <div
            className="grid grid-cols-6 gap-2"
            role="radiogroup"
            aria-label="絵文字を選ぶ"
          >
            {EMOJI_PRESETS.map((e) => {
              const selected = value.emoji === e;
              return (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`avatar-emoji-preset-${e}`}
                  onClick={() => setEmoji(e)}
                  className={`inline-flex items-center justify-center rounded-lg text-xl transition-colors ${
                    selected
                      ? "bg-orange-100 ring-2 ring-orange-500"
                      : "bg-neutral-50 hover:bg-neutral-100"
                  }`}
                  style={{ width: 44, height: 44 }}
                >
                  {e}
                </button>
              );
            })}
          </div>
          {/* custom input */}
          <label className="flex items-center gap-2 text-xs">
            <span className="font-semibold shrink-0">カスタム:</span>
            <Input
              type="text"
              aria-label="カスタム絵文字"
              placeholder="絵文字 1 字を入力"
              data-testid="avatar-emoji-custom"
              maxLength={4}
              value={
                value.emoji && !EMOJI_PRESETS.includes(value.emoji as (typeof EMOJI_PRESETS)[number])
                  ? value.emoji
                  : ""
              }
              onChange={(e) => setEmoji(e.target.value)}
            />
          </label>
          {/* color picker (emoji 背景にも使用) */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-500">背景色:</span>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_COLOR_KEYS.map((key) => {
                const selected = (value.color ?? "green") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={AVATAR_COLORS[key].label}
                    onClick={() => setColor(key)}
                    className={`rounded-full transition-transform ${
                      selected
                        ? "ring-2 ring-offset-1 ring-orange-500 scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{
                      width: 24,
                      height: 24,
                      background: colorGradient(key),
                      border: "1px solid #FFFCF4",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
