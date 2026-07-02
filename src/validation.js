import { confirmedAssignmentStatus } from "./constants.js";
import {
  applyLockedAssignments,
  buildDateBasedCandidateAssignments,
  filterInvalidCandidates
} from "./scheduler.js";

export function validateDb(db) {
  const issues = [];
  validateNames(db, issues);
  validateSupportLevels(db, issues);
  validateTimeSlots(db, issues);
  validateReferences(db, issues);
  validateDateAvailability(db, issues);
  validateDuplicates(db, issues);
  validateLessonRequests(db, issues);
  validateConfirmedAssignments(db, issues);
  validateLockedAssignments(db, issues);
  return issues;
}

export function generatorReadiness(db) {
  const issues = [];
  const activeRequestStudentIds = new Set(db.lessonRequests.filter((request) => request.status === "active").map((request) => request.studentId));
  if (!db.timeSlots.some((slot) => slot.isActive)) issues.push("有効な時間割スロットがありません。");
  if (!db.teachers.length) issues.push("講師が未登録です。");
  if (!db.students.length) issues.push("生徒が未登録です。");
  if (db.teachers.some((teacher) => !String(teacher.name || "").trim())) issues.push("名前未入力の講師がいます。");
  if (db.students.some((student) => !String(student.name || "").trim())) issues.push("名前未入力の生徒がいます。");
  if (db.teachers.some((teacher) => !db.teacherSubjects.some((item) => item.teacherId === teacher.id))) issues.push("対応教科未設定の講師がいます。");
  if ([...activeRequestStudentIds].some((studentId) => !db.studentDateAvailability.some((item) => item.studentId === studentId))) issues.push("授業可能日未設定の生徒がいます。");
  if (!db.teacherDateAvailability.some((item) => item.teacherId)) issues.push("授業可能日未設定の講師がいます。");
  if (db.lessonRequests.filter((request) => request.status === "active").length === 0) issues.push("有効な受講希望がありません。");
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
    scheduleSolutionId: new Set(db.scheduleSolutions.map((item) => item.id)),
    lessonRequestId: new Set(db.lessonRequests.map((item) => item.id))
  };
  validateRefTable(db.teacherSubjects, ["teacherId", "subjectId"], sets, issues, "teacherSubjects");
  validateRefTable(db.studentSubjectRequests, ["studentId", "subjectId"], sets, issues, "studentSubjectRequests");
  validateRefTable(db.studentTeacherPreferences, ["studentId", "teacherId"], sets, issues, "studentTeacherPreferences");
  validateRefTable(db.studentTeacherCompatibilities || [], ["studentId", "teacherId"], sets, issues, "studentTeacherCompatibilities");
  validateRefTable(db.currentLessonAssignments, ["teacherId", "studentId", "subjectId", "timeSlotId"], sets, issues, "currentLessonAssignments");
  validateRefTable(db.scheduleAssignments, ["scheduleSolutionId", "teacherId", "studentId", "subjectId", "timeSlotId"], sets, issues, "scheduleAssignments");
}

function validateDateAvailability(db, issues) {
  const teacherIds = new Set(db.teachers.map((item) => item.id));
  const studentIds = new Set(db.students.map((item) => item.id));
  const slotIds = new Set(db.timeSlots.map((item) => item.id));
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  for (const row of db.teacherDateAvailability || []) {
    if (!teacherIds.has(row.teacherId)) issues.push("講師の日付ごとの授業可能時間に、登録されていない講師が含まれています。");
    if (!datePattern.test(String(row.date || ""))) issues.push("講師の日付ごとの授業可能時間に、日付形式が不正なデータがあります。");
    if (!slotIds.has(row.lessonTimeSlotId)) issues.push("講師の日付ごとの授業可能時間に、使えない時間帯が含まれています。");
  }

  for (const row of db.studentDateAvailability || []) {
    if (!studentIds.has(row.studentId)) issues.push("生徒の日付ごとの授業可能時間に、登録されていない生徒が含まれています。");
    if (!datePattern.test(String(row.date || ""))) issues.push("生徒の日付ごとの授業可能時間に、日付形式が不正なデータがあります。");
    if (!slotIds.has(row.lessonTimeSlotId)) issues.push("生徒の日付ごとの授業可能時間に、使えない時間帯が含まれています。");
  }
}

function validateLessonRequests(db, issues) {
  const studentIds = new Set(db.students.map((item) => item.id));
  const subjectIds = new Set(db.subjects.map((item) => item.id));
  const teacherIds = new Set(db.teachers.map((item) => item.id));
  for (const request of db.lessonRequests) {
    if (!studentIds.has(request.studentId)) issues.push("lessonRequests が存在しない studentId を参照しています。");
    if (!subjectIds.has(request.subjectId)) issues.push("lessonRequests が存在しない subjectId を参照しています。");
    if (Number(request.lessonsPerWeek) < 1) issues.push("lessonRequests の lessonsPerWeek は1以上が必要です。");
    if (Number(request.durationSlots) < 1) issues.push("lessonRequests の durationSlots は1以上が必要です。");
    if (!["active", "inactive"].includes(request.status)) issues.push("lessonRequests の status は active / inactive のみです。");
    for (const teacherId of request.preferredTeacherIds || []) {
      if (!teacherIds.has(teacherId)) issues.push("lessonRequests の preferredTeacherIds に存在しない講師IDがあります。");
    }
    for (const teacherId of request.blockedTeacherIds || []) {
      if (!teacherIds.has(teacherId)) issues.push("lessonRequests の blockedTeacherIds に存在しない講師IDがあります。");
    }
  }
}

function validateConfirmedAssignments(db, issues) {
  const teacherIds = new Set(db.teachers.map((item) => item.id));
  const studentIds = new Set(db.students.map((item) => item.id));
  const subjectIds = new Set(db.subjects.map((item) => item.id));
  const timeSlotIds = new Set(db.timeSlots.map((item) => item.id));
  const lessonRequestIds = new Set(db.lessonRequests.map((item) => item.id));
  const seen = new Set();
  for (const assignment of db.confirmedAssignments) {
    if (!studentIds.has(assignment.studentId)) issues.push("confirmedAssignments が存在しない studentId を参照しています。");
    if (!teacherIds.has(assignment.teacherId)) issues.push("confirmedAssignments が存在しない teacherId を参照しています。");
    if (!subjectIds.has(assignment.subjectId)) issues.push("confirmedAssignments が存在しない subjectId を参照しています。");
    if (!timeSlotIds.has(assignment.timeSlotId)) issues.push("confirmedAssignments が存在しない timeSlotId を参照しています。");
    if (assignment.lessonRequestId && !lessonRequestIds.has(assignment.lessonRequestId)) issues.push("confirmedAssignments が存在しない lessonRequestId を参照しています。");
    if (!db.teacherSubjects.some((item) => item.teacherId === assignment.teacherId && item.subjectId === assignment.subjectId)) {
      issues.push("confirmedAssignments に講師対応外の教科が含まれています。");
    }
    const isDateBased = Boolean(assignment.date && (assignment.lessonTimeSlotId || assignment.timeSlotId));
    if (isDateBased) {
      if (!db.teacherDateAvailability.some((item) => item.teacherId === assignment.teacherId && item.date === assignment.date && item.lessonTimeSlotId === (assignment.lessonTimeSlotId || assignment.timeSlotId))) {
        issues.push("confirmedAssignments に講師可能日外の割当があります。");
      }
      if (!db.studentDateAvailability.some((item) => item.studentId === assignment.studentId && item.date === assignment.date && item.lessonTimeSlotId === (assignment.lessonTimeSlotId || assignment.timeSlotId))) {
        issues.push("confirmedAssignments に生徒可能日外の割当があります。");
      }
    } else {
      issues.push("confirmedAssignments に日付が入っていない割当があります。");
    }
    const studentConflictKey = `${assignment.studentId}|${assignment.date || ""}|${assignment.lessonTimeSlotId || assignment.timeSlotId}|${assignment.status}`;
    if (assignment.status === confirmedAssignmentStatus.confirmed && seen.has(studentConflictKey)) {
      issues.push(isDateBased ? "同じ生徒が同じ日時に複数 confirmedAssignments を持っています。" : "同じ生徒が同じ timeSlotId に複数 confirmedAssignments を持っています。");
    }
    seen.add(studentConflictKey);
  }
}

function validateDuplicates(db, issues) {
  assertUnique(db.teacherSubjects, ["teacherId", "subjectId"], issues, "teacherSubjects");
  assertUnique(db.studentSubjectRequests, ["studentId", "subjectId"], issues, "studentSubjectRequests");
  assertUnique(db.studentTeacherPreferences, ["studentId", "teacherId", "preferenceType"], issues, "studentTeacherPreferences");
  assertUnique(db.studentTeacherCompatibilities || [], ["studentId", "teacherId"], issues, "studentTeacherCompatibilities");
  assertUnique(db.teacherDateAvailability || [], ["teacherId", "date", "lessonTimeSlotId"], issues, "teacherDateAvailability");
  assertUnique(db.studentDateAvailability || [], ["studentId", "date", "lessonTimeSlotId"], issues, "studentDateAvailability");
}

function validateLockedAssignments(db, issues) {
  const lockedAssignments = db.scheduleAssignments.filter((item) => item.isLocked);
  const valid = applyLockedAssignments(db, lockedAssignments);
  if (lockedAssignments.length !== valid.length) {
    issues.push("固定済み割当の一部が絶対条件に違反しています。");
  }
  const candidates = filterInvalidCandidates(db, buildDateBasedCandidateAssignments(db));
  for (const assignment of lockedAssignments) {
    const match = candidates.some((candidate) =>
      candidate.teacherId === assignment.teacherId &&
      candidate.studentId === assignment.studentId &&
      candidate.lessonRequestId === assignment.lessonRequestId &&
      candidate.subjectId === assignment.subjectId &&
      candidate.timeSlotId === assignment.timeSlotId &&
      candidate.date === assignment.date
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
