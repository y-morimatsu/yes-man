/** Persona feature strings (INCEPTION ui-mockups screen-06 完全準拠). */
export const STRINGS = {
  pageTitle: "ペルソナ管理",
  tabMy: "自分の Persona",
  tabShared: "共有プール",
  createButton: "＋ 新規",
  searchPlaceholder: "🔍 ペルソナを 探す...",
  footnoteMaxThree: "最大 3 個 まで 合議に組込み 可能",
  footnoteShareOptIn: "🔒 共有はオプトイン (FR-PERSONA-04)",
  cancelButton: "キャンセル",
  saveButton: "保存",
  modalTitle: "新規ペルソナ作成",
  fieldName: "名前",
  fieldDescription: "説明 (任意)",
  fieldPrompt: "プロンプト指示文",
  fieldAvatarUrl: "アバター URL (任意)",
  rejectedDefault: "このペルソナは沈黙演出ドメインに該当するため作成できません。",
  createSuccess: "ペルソナを作成しました",
  selectionPageTitle: "ペルソナ選択 (最大 3)",
  selectionSaveButton: "選択を保存",
  selectionResetButton: "builtin にリセット",
  selectionOverLimit: "最大 3 つまで選択可能です",
  selectionSaved: "選択を保存しました",
  selectionReset: "builtin にリセットしました",
  emptyMy: "まだ自分の Persona がありません",
  emptyShared: "共有プールに公開された Persona がありません",
  sortPopularity: "人気順",
  sortNewest: "新着順",
  sortAcceptance: "採択率順",
} as const;

export type PersonaStringKey = keyof typeof STRINGS;
export function t(key: PersonaStringKey): string {
  return STRINGS[key];
}
