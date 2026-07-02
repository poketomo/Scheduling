export const STORAGE_KEY = "scheduling-mvp-db-v1";
export const LEGACY_STORAGE_KEY = "scheduling-mvp-state-v1";
export const SCHEMA_VERSION = 2;

export const tabs = [
  { id: "teachers", label: "講師" },
  { id: "students", label: "生徒" },
  { id: "slots", label: "授業時間" },
  { id: "generator", label: "日程案を作成" },
  { id: "results", label: "作成結果" }
];

export const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

export const genders = [
  { value: "any", label: "指定なし" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" }
];

export const lessonRequestStatus = {
  active: "active",
  inactive: "inactive"
};

export const confirmedAssignmentStatus = {
  confirmed: "confirmed",
  cancelled: "cancelled"
};

export const reasonLabels = {
  NO_STUDENT_AVAILABILITY: "生徒の参加できる時間がまだ足りません",
  NO_SUBJECT_REQUEST: "教科の希望が見つかりません",
  NO_TEACHER_FOR_SUBJECT: "この教科を担当できる講師がいません",
  NO_COMMON_TIME_SLOT: "講師と生徒の時間が重なる枠がありません",
  ONLY_BLOCKED_TEACHERS_AVAILABLE: "空いている講師がすべて NG 講師です",
  TEACHER_SLOT_CAPACITY_FULL: "その時間は講師の受け持ち上限に達しています",
  STUDENT_TIME_CONFLICT: "その時間には別の授業が入っています",
  LOCKED_ASSIGNMENT_CONFLICT: "固定した予定とぶつかっています",
  UNKNOWN: "条件に合う組み合わせが見つかりません"
};

export const scoreWeights = {
  subjectMatch: 40,
  preferredTeacher: 30,
  currentTeacher: 20,
  genderMatch: 15,
  teacherCompatibility: {
    1: -30,
    2: -10,
    3: 0,
    4: 10,
    5: 20
  },
  supportBase: 10,
  supportConcentrationPenalty: -20,
  teacherLoadPenalty: -10,
  sameDayRepeatPenalty: -40,
  splitDayBonus: 20
};

export function now() {
  return new Date().toISOString();
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
