import { applyLockedAssignments, buildCandidateAssignments, filterInvalidCandidates } from "./scheduler.js";

export function validateDb(db) {
  const issues = [];
  validateNames(db, issues);
  validateSupportLevels(db, issues);
  validateTimeSlots(db, issues);
  validateReferences(db, issues);
  validateDuplicates(db, issues);
  validateLockedAssignments(db, issues);
  return issues;
}

export function generatorReadiness(db) {
  const issues = [];
  if (!db.timeSlots.some((slot) => slot.isActive)) issues.push("有効な時間割スロットがありません。");
  if (!db.teachers.length) issues.push("講師が未登録です。");
  if (!db.students.length) issues.push("生徒が未登録です。");
  if (db.teachers.some((teacher) => !String(teacher.name || "").trim())) issues.push("名前未入力の講師がいます。");
  if (db.students.some((student) => !String(student.name || "").trim())) issues.push("名前未入力の生徒がいます。");
  if (db.teachers.some((teacher) => !db.teacherSubjects.some((item) => item.teacherId === teacher.id))) issues.push("対応教科未設定の講師がいます。");
  if (db.students.some((student) => !db.studentSubjectRequests.some((item) => item.studentId === student.id))) issues.push("希望教科未設定の生徒がいます。");
  if (db.teachers.some((teacher) => !db.teacherAvailabilitySlots.some((item) => item.teacherId === teacher.id))) issues.push("可能時間未設定の講師がいます。");
  if (db.students.some((student) => !db.studentAvailabilitySlots.some((item) => item.studentId === student.id))) issues.push("可能時間未設定の生徒がいます。");
  issues.push(...validateDb(db));
  return [...new Set(issues)];
}

function validateNames(db, issues) {
  for (const teacher of db.teachers) {
    if (!String(teacher.name || "").trim()) issues.push("講師名が空です。");
  }
  for (const student of db.students) {
    if (!String(student.name || "").trim()) issues.push("生徒名が空です。");
  }
}

function validateSupportLevels(db, issues) {
  for (const student of db.students) {
    if (Number(student.supportLevel) < 1 || Number(student.supportLevel) > 5) {
      issues.push(`生徒 ${student.id} の手のかかる度が範囲外です。`);
    }
  }
}

function validateTimeSlots(db, issues) {
  for (const slot of db.timeSlots) {
    if (slot.startTime >= slot.endTime) issues.push(`時間割スロット ${slot.id} の開始終了時刻が不正です。`);
  }
}

function validateReferences(db, issues) {
  const sets = {
    teacherId: new Set(db.teachers.map((item) => item.id)),
    studentId: new Set(db.students.map((item) => item.id)),
    subjectId: new Set(db.subjects.map((item) => item.id)),
    timeSlotId: new Set(db.timeSlots.map((item) => item.id)),
    scheduleSolutionId: new Set(db.scheduleSolutions.map((item) => item.id))
  };
  validateRefTable(db.teacherSubjects, ["teacherId", "subjectId"], sets, issues, "teacherSubjects");
  validateRefTable(db.teacherAvailabilitySlots, ["teacherId", "timeSlotId"], sets, issues, "teacherAvailabilitySlots");
  validateRefTable(db.studentAvailabilitySlots, ["studentId", "timeSlotId"], sets, issues, "studentAvailabilitySlots");
  validateRefTable(db.studentSubjectRequests, ["studentId", "subjectId"], sets, issues, "studentSubjectRequests");
  validateRefTable(db.studentTeacherPreferences, ["studentId", "teacherId"], sets, issues, "studentTeacherPreferences");
  validateRefTable(db.currentLessonAssignments, ["teacherId", "studentId", "subjectId", "timeSlotId"], sets, issues, "currentLessonAssignments");
  validateRefTable(db.scheduleAssignments, ["scheduleSolutionId", "teacherId", "studentId", "subjectId", "timeSlotId"], sets, issues, "scheduleAssignments");
}

function validateDuplicates(db, issues) {
  assertUnique(db.teacherSubjects, ["teacherId", "subjectId"], issues, "teacherSubjects");
  assertUnique(db.teacherAvailabilitySlots, ["teacherId", "timeSlotId"], issues, "teacherAvailabilitySlots");
  assertUnique(db.studentAvailabilitySlots, ["studentId", "timeSlotId"], issues, "studentAvailabilitySlots");
  assertUnique(db.studentSubjectRequests, ["studentId", "subjectId"], issues, "studentSubjectRequests");
  assertUnique(db.studentTeacherPreferences, ["studentId", "teacherId", "preferenceType"], issues, "studentTeacherPreferences");
}

function validateLockedAssignments(db, issues) {
  const lockedAssignments = db.scheduleAssignments.filter((item) => item.isLocked);
  const valid = applyLockedAssignments(db, lockedAssignments);
  if (lockedAssignments.length !== valid.length) {
    issues.push("固定済み割当の一部が絶対条件に違反しています。");
  }
  const candidates = filterInvalidCandidates(db, buildCandidateAssignments(db));
  for (const assignment of lockedAssignments) {
    const match = candidates.some((candidate) =>
      candidate.teacherId === assignment.teacherId &&
      candidate.studentId === assignment.studentId &&
      candidate.subjectId === assignment.subjectId &&
      candidate.timeSlotId === assignment.timeSlotId
    );
    if (!match) issues.push("固定済み割当に無効な候補が含まれています。");
  }
}

function validateRefTable(rows, keys, sets, issues, name) {
  for (const row of rows) {
    for (const key of keys) {
      if (!sets[key]?.has(row[key])) issues.push(`${name} が存在しない ${key} を参照しています。`);
    }
  }
}

function assertUnique(rows, keys, issues, name) {
  const seen = new Set();
  for (const row of rows) {
    const signature = keys.map((key) => row[key]).join("|");
    if (seen.has(signature)) issues.push(`${name} に重複行があります。`);
    seen.add(signature);
  }
}
