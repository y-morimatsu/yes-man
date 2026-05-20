/** Profile feature strings (INCEPTION A3 仕様準拠 + U7d NFR Req Imp3). */
export const STRINGS = {
  pageTitle: "プロフィール",
  fieldEmail: "Email",
  fieldSub: "Sub",
  // INCEPTION A3: プロフィール初期入力 mockup の各フィールド
  fieldAgeGroup: "年齢層",
  fieldOccupation: "職業 (任意)",
  fieldValueTags: "価値観タグ (複数可)",
  fieldGender: "性別",
  fieldLifeStage: "ライフステージ",
  valueTagsPlaceholder: "効率重視 / 慎重 / 楽観 ...",
  ageGroupPlaceholder: "20代 / 30代 / 40代...",
  saveButton: "保存",
  saveSuccess: "保存しました",
  // 編集 UI (BasicAttributesCard)
  editButton: "編集",
  saveError: "保存に失敗しました",
  tagAddPlaceholder: "カスタムタグを追加",
  tagAddButton: "追加",
  tagsFullNotice: "タグは最大 20 件までです",
  occupationPlaceholder: "例: ソフトウェアエンジニア",
  deleteSectionTitle: "アカウント削除",
  deleteButton: "アカウント削除",
  deleteModalTitle: "アカウント削除確認",
  deleteWarning: "すべてのデータ (Profile / Decision history / Persona / Selection) が完全に削除されます。",
  deleteUnrecoverable: "この操作は取消できません。",
  deleteConfirmLabel: "上記を理解し、アカウントを削除することに同意します。",
  deleteFinalButton: "完全に削除する",
  cancelButton: "キャンセル",
  deleteSuccess: "アカウントを削除しました",
} as const;

export type ProfileStringKey = keyof typeof STRINGS;
export function t(key: ProfileStringKey): string {
  return STRINGS[key];
}
