/** Profile 基本属性の preset 選択肢 (BasicAttributesCard で使用). */

export const AGE_GROUP_PRESETS = [
  "10代",
  "20代",
  "30代",
  "40代",
  "50代",
  "60代",
  "70代以上",
] as const;

export const LIFE_STAGE_PRESETS = [
  "学生",
  "社会人",
  "独身",
  "既婚",
  "子育て中",
  "退職後",
] as const;

export const GENDER_PRESETS = [
  "男性",
  "女性",
  "その他",
  "回答しない",
] as const;

export const VALUE_TAG_PRESETS = [
  "効率重視",
  "慎重",
  "楽観",
  "共感重視",
  "冒険的",
  "安定志向",
  "計画的",
  "直感的",
] as const;

export const PROFILE_LIMITS = {
  DISPLAY_NAME_MAX_LENGTH: 50,
  AGE_GROUP_MAX_LENGTH: 20,
  OCCUPATION_MAX_LENGTH: 100,
  LIFE_STAGE_MAX_LENGTH: 50,
  VALUE_TAG_MAX_LENGTH: 50,
  VALUE_TAGS_MAX_COUNT: 20,
  /** gender は preset 4 件 + allowCustom=false なので実質到達しないが、API max_length=10 に合わせて定義 */
  GENDER_MAX_COUNT: 10,
} as const;
