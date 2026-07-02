export const STORAGE_KEY = "scheduling-mvp-db-v1";
export const LEGACY_STORAGE_KEY = "scheduling-mvp-state-v1";
export const SCHEMA_VERSION = 1;

export const tabs = [
  { id: "teachers", label: "講師一覧・追加編集" },
  { id: "students", label: "生徒一覧・追加編集" },
  { id: "slots", label: "時間割設定" },
  { id: "generator", label: "自動生成" },
  { id: "results", label: "生成結果確認" }
];

export const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

export const genders = [
  { value: "any", label: "指定なし" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" }
];

export const scoreWeights = {
  subjectMatch: 40,
  preferredTeacher: 30,
  currentTeacher: 20,
  genderMatch: 15,
  supportBase: 10,
  supportConcentrationPenalty: -20,
  teacherLoadPenalty: -10
};

export function now() {
  return new Date().toISOString();
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
