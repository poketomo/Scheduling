import test from "node:test";
import assert from "node:assert/strict";

import { buildSampleDb } from "../src/sampleData.js";
import {
  buildCandidateAssignments,
  buildLessonRequestUnits,
  createConfirmedAssignmentsFromSolution,
  generateScheduleSolutions
} from "../src/scheduler.js";
import { scoreCandidate } from "../src/scoring.js";
import { cloneLessonRequestRecord, createEmptyDb, mergeDateAvailabilityRows } from "../src/storage.js";
import { validateDb } from "../src/validation.js";

function firstSolution(db, options = {}) {
  const result = generateScheduleSolutions(db, { candidateCount: 3, ...options });
  return {
    run: result.run,
    solution: result.solutions[0],
    assignments: result.assignments.filter((item) => item.scheduleSolutionId === result.solutions[0].id)
  };
}

test("NG講師には割り当てられない", () => {
  const db = buildSampleDb();
  const blockedPref = db.studentTeacherPreferences.find((item) => item.preferenceType === "blocked");
  const { assignments } = firstSolution(db);
  assert.equal(assignments.some((item) => item.studentId === blockedPref.studentId && item.teacherId === blockedPref.teacherId), false);
});

test("講師1人1コマに4人以上入らない", () => {
  const db = buildSampleDb();
  const { assignments } = firstSolution(db);
  const grouped = new Map();
  for (const assignment of assignments) {
    const key = `${assignment.teacherId}|${assignment.timeSlotId}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  assert.equal([...grouped.values()].every((count) => count <= 3), true);
});

test("生徒が同じ時間に重複割当されない", () => {
  const db = buildSampleDb();
  const { assignments } = firstSolution(db);
  const grouped = new Set();
  for (const assignment of assignments) {
    const key = `${assignment.studentId}|${assignment.timeSlotId}`;
    assert.equal(grouped.has(key), false);
    grouped.add(key);
  }
});

test("講師が対応できない教科には割り当てられない", () => {
  const db = buildSampleDb();
  const { assignments } = firstSolution(db);
  for (const assignment of assignments) {
    assert.equal(
      db.teacherSubjects.some((item) => item.teacherId === assignment.teacherId && item.subjectId === assignment.subjectId),
      true
    );
  }
});

test("講師と生徒の両方が可能な時間だけ使われる", () => {
  const db = buildSampleDb();
  const { assignments } = firstSolution(db);
  for (const assignment of assignments) {
    assert.equal(db.teacherAvailabilitySlots.some((item) => item.teacherId === assignment.teacherId && item.timeSlotId === assignment.timeSlotId), true);
    assert.equal(db.studentAvailabilitySlots.some((item) => item.studentId === assignment.studentId && item.timeSlotId === assignment.timeSlotId), true);
  }
});

test("希望講師一致でスコアが上がる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.preferredTeacherIds.length > 0);
  const preferredTeacher = request.preferredTeacherIds[0];
  const candidate = {
    studentId: request.studentId,
    lessonRequestId: request.id,
    teacherId: preferredTeacher,
    subjectId: request.subjectId,
    timeSlotId: db.studentAvailabilitySlots.find((item) => item.studentId === request.studentId).timeSlotId,
    dayOfWeek: 1
  };
  const preferred = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set([preferredTeacher]),
    preferredGender: null,
    teacherGender: "female",
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const neutral = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    preferredGender: null,
    teacherGender: "female",
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(preferred.total > neutral.total);
});

test("希望性別一致でスコアが上がる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.preferredGender === "female");
  const candidate = {
    studentId: request.studentId,
    lessonRequestId: request.id,
    teacherId: db.teachers[0].id,
    subjectId: request.subjectId,
    timeSlotId: db.studentAvailabilitySlots.find((item) => item.studentId === request.studentId).timeSlotId,
    dayOfWeek: 1
  };
  const matched = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    preferredGender: "female",
    teacherGender: "female",
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const unmatched = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    preferredGender: "male",
    teacherGender: "female",
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(matched.total > unmatched.total);
});

test("手のかかる度が高い生徒の集中が減点される", () => {
  const db = buildSampleDb();
  const assignmentGroup = [
    { studentId: db.students.find((item) => item.name === "山田花子").id },
    { studentId: db.students.find((item) => item.name === "高橋葵").id },
    { studentId: db.students.find((item) => item.name === "井上光").id }
  ];
  const request = db.lessonRequests.find((item) => item.studentId === assignmentGroup[2].studentId);
  const scored = scoreCandidate(db, { studentId: request.studentId, lessonRequestId: request.id, teacherId: db.teachers[0].id, dayOfWeek: 1 }, {
    preferredTeacherIds: new Set(),
    preferredGender: null,
    teacherGender: "female",
    assignmentGroup,
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.equal(scored.breakdown.some((item) => item.label === "高サポート集中" && item.value < 0), true);
});

test("未割当理由が返る", () => {
  const db = buildSampleDb();
  const result = generateScheduleSolutions(db, { candidateCount: 1 });
  const solution = result.solutions[0];
  assert.equal(Array.isArray(solution.summaryJson.unassigned), true);
  assert.equal(solution.summaryJson.unassigned.some((item) => Array.isArray(item.reasons) && item.reasons.length > 0), true);
});

test("固定済み割当が再生成後も維持される", () => {
  const db = buildSampleDb();
  const initial = generateScheduleSolutions(db, { candidateCount: 1 });
  const assignment = initial.assignments[0];
  db.scheduleAssignments.push({ ...assignment, isLocked: true });
  const regenerated = generateScheduleSolutions(db, {
    candidateCount: 1,
    preserveLocks: true,
    lockedAssignments: db.scheduleAssignments.filter((item) => item.isLocked)
  });
  const locked = regenerated.assignments.find((item) => item.scheduleSolutionId === regenerated.solutions[0].id && item.studentId === assignment.studentId && item.lessonRequestId === assignment.lessonRequestId);
  assert.equal(Boolean(locked), true);
  assert.equal(locked.teacherId, assignment.teacherId);
  assert.equal(locked.timeSlotId, assignment.timeSlotId);
});

test("1人の生徒が2教科を希望した場合、2件の受講希望として扱われる", () => {
  const db = buildSampleDb();
  const student = db.students.find((item) => item.name === "複数教科生徒");
  assert.equal(db.lessonRequests.filter((item) => item.studentId === student.id).length, 2);
});

test("lessonsPerWeek = 2 の場合、2回分の割当ユニットが生成される", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.lessonsPerWeek === 2 && item.studentId === db.students.find((student) => student.name === "週2回希望生徒").id);
  const units = buildLessonRequestUnits(db).filter((item) => item.lessonRequestId === request.id);
  assert.equal(units.length, 2);
});

test("同じ生徒の複数授業が同じ時間帯に重複しない", () => {
  const db = buildSampleDb();
  const student = db.students.find((item) => item.name === "複数教科生徒");
  const { assignments } = firstSolution(db);
  const ownAssignments = assignments.filter((item) => item.studentId === student.id);
  const signatures = new Set();
  for (const assignment of ownAssignments) {
    const key = `${assignment.studentId}|${assignment.timeSlotId}`;
    assert.equal(signatures.has(key), false);
    signatures.add(key);
  }
});

test("複数回授業は可能なら別曜日に分散される", () => {
  const db = buildSampleDb();
  const weeklyStudent = db.students.find((item) => item.name === "週2回希望生徒");
  const { assignments } = firstSolution(db);
  const ownAssignments = assignments.filter((item) => item.studentId === weeklyStudent.id);
  const days = ownAssignments.map((item) => db.timeSlots.find((slot) => slot.id === item.timeSlotId)?.dayOfWeek);
  assert.equal(ownAssignments.length, 2);
  assert.equal(new Set(days).size, 2);
});

test("既存のNG講師除外がlessonRequest単位でも守られる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.blockedTeacherIds.length > 0);
  const { assignments } = firstSolution(db);
  assert.equal(assignments.some((item) => item.lessonRequestId === request.id && request.blockedTeacherIds.includes(item.teacherId)), false);
});

test("lessonRequest単位で希望講師スコアが反映される", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.preferredTeacherIds.length > 0);
  const candidates = buildCandidateAssignments(db).filter((item) => item.lessonRequestId === request.id);
  const preferredCandidate = candidates.find((item) => item.teacherId === request.preferredTeacherIds[0]);
  const otherCandidate = candidates.find((item) => item.teacherId !== request.preferredTeacherIds[0]);
  assert.ok(preferredCandidate);
  assert.ok(otherCandidate);
  const preferredScore = scoreCandidate(db, preferredCandidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === preferredCandidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const otherScore = scoreCandidate(db, otherCandidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === otherCandidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(preferredScore.total > otherScore.total);
});

test("未割当理由が複数返る", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.studentId === db.students.find((student) => student.name === "森未割当").id);
  request.blockedTeacherIds = db.teachers.map((teacher) => teacher.id);
  const result = generateScheduleSolutions(db, { candidateCount: 1 });
  const entry = result.solutions[0].summaryJson.unassigned.find((item) => item.lessonRequestId === request.id);
  assert.ok(entry.reasons.length >= 2);
});

test("未割当理由にcodeが含まれる", () => {
  const db = buildSampleDb();
  const result = generateScheduleSolutions(db, { candidateCount: 1 });
  const entry = result.solutions[0].summaryJson.unassigned[0];
  assert.equal(typeof entry.reasons[0].code, "string");
});

test("確定処理でconfirmedAssignmentsが作られる", () => {
  const db = buildSampleDb();
  const generated = generateScheduleSolutions(db, { candidateCount: 1 });
  db.scheduleAssignments = generated.assignments;
  const solutionId = generated.solutions[0].id;
  const confirmed = createConfirmedAssignmentsFromSolution(db, solutionId);
  assert.ok(confirmed.length > 0);
  assert.equal(confirmed.every((item) => item.sourceScheduleSolutionId === solutionId), true);
});

test("確定済み割当が次回生成時に衝突チェック対象になる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.studentId === db.students.find((student) => student.name === "確定済み衝突生徒").id);
  const generated = generateScheduleSolutions(db, { candidateCount: 1 });
  const assignments = generated.assignments.filter((item) => item.lessonRequestId === request.id);
  assert.equal(assignments.length, 1);
});
test("inactive lessonRequest は生成対象外になる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.status !== "inactive");
  request.status = "inactive";
  const units = buildLessonRequestUnits(db).filter((item) => item.lessonRequestId === request.id);
  assert.equal(units.length, 0);
  const result = generateScheduleSolutions(db, { candidateCount: 1 });
  assert.equal(result.assignments.some((item) => item.lessonRequestId === request.id), false);
});

test("lessonRequest 複製後は別idになる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests[0];
  const duplicate = cloneLessonRequestRecord(request);
  assert.notEqual(duplicate.id, request.id);
  assert.equal(duplicate.studentId, request.studentId);
  assert.equal(duplicate.subjectId, request.subjectId);
});

test("preferredTeacherIds と blockedTeacherIds が重複した場合は blocked が優先される", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests[0];
  const teacherId = db.teachers[0].id;
  request.preferredTeacherIds = [teacherId];
  request.blockedTeacherIds = [teacherId];
  const duplicate = cloneLessonRequestRecord(request);
  assert.deepEqual(duplicate.preferredTeacherIds, []);
  assert.deepEqual(duplicate.blockedTeacherIds, [teacherId]);
});

test("相性5の講師は相性3の講師より高スコアになる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.blockedTeacherIds.length === 0);
  const candidates = buildCandidateAssignments(db).filter((item) => item.lessonRequestId === request.id);
  const baseCandidate = candidates[0];
  const betterCandidate = candidates.find((item) => item.teacherId !== baseCandidate.teacherId);
  assert.ok(baseCandidate);
  assert.ok(betterCandidate);
  db.studentTeacherCompatibilities.push({
    id: "compat-strong",
    studentId: request.studentId,
    teacherId: baseCandidate.teacherId,
    score: 5
  });
  const strong = scoreCandidate(db, baseCandidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === baseCandidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const neutral = scoreCandidate(db, betterCandidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === betterCandidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(strong.total > neutral.total);
  assert.equal(strong.breakdown.some((item) => item.label === "講師相性" && item.value === 20), true);
});

test("相性1の講師は減点される", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.blockedTeacherIds.length === 0);
  const candidate = buildCandidateAssignments(db).find((item) => item.lessonRequestId === request.id);
  assert.ok(candidate);
  db.studentTeacherCompatibilities.push({
    id: "compat-low",
    studentId: request.studentId,
    teacherId: candidate.teacherId,
    score: 1
  });
  const scored = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === candidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.equal(scored.breakdown.some((item) => item.label === "講師相性" && item.value === -30), true);
});

test("相性未設定は3扱いになる", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.blockedTeacherIds.length === 0);
  const candidate = buildCandidateAssignments(db).find((item) => item.lessonRequestId === request.id);
  assert.ok(candidate);
  const unset = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === candidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  db.studentTeacherCompatibilities.push({
    id: "compat-neutral",
    studentId: request.studentId,
    teacherId: candidate.teacherId,
    score: 3
  });
  const neutral = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(request.preferredTeacherIds),
    preferredGender: request.preferredGender,
    teacherGender: db.teachers.find((item) => item.id === candidate.teacherId).gender,
    assignmentGroup: [],
    requestAssignments: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.equal(unset.total, neutral.total);
});

test("NG講師は相性5でも割り当てられない", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests.find((item) => item.blockedTeacherIds.length > 0);
  const blockedTeacherId = request.blockedTeacherIds[0];
  db.studentTeacherCompatibilities.push({
    id: "compat-blocked",
    studentId: request.studentId,
    teacherId: blockedTeacherId,
    score: 5
  });
  const { assignments } = firstSolution(db);
  assert.equal(assignments.some((item) => item.lessonRequestId === request.id && item.teacherId === blockedTeacherId), false);
});

test("lessonsPerWeek の変更が生成ユニット数に反映される", () => {
  const db = buildSampleDb();
  const request = db.lessonRequests[0];
  request.lessonsPerWeek = 3;
  const units = buildLessonRequestUnits(db).filter((item) => item.lessonRequestId === request.id);
  assert.equal(units.length, 3);
});

test("授業希望がない生徒は生成対象外になる", () => {
  const db = buildSampleDb();
  const studentId = "student-no-request";
  db.students.push({ id: studentId, name: "希望なし生徒", supportLevel: 3, memo: "", extraJson: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const result = generateScheduleSolutions(db, { candidateCount: 1 });
  assert.equal(result.assignments.some((item) => item.studentId === studentId), false);
});

test("初期教科は10件ある", () => {
  const db = createEmptyDb();
  assert.equal(db.subjects.length, 10);
});

test("重複する開始時刻の時間帯を初期化できる", () => {
  const db = createEmptyDb();
  const sameStart = db.timeSlots.filter((slot) => slot.startTime === "19:00").map((slot) => slot.endTime);
  assert.equal(sameStart.includes("20:20"), true);
  assert.equal(sameStart.includes("19:50"), true);
});

test("teacherDateAvailability が createEmptyDb に含まれる", () => {
  const db = createEmptyDb();
  assert.equal(Array.isArray(db.teacherDateAvailability), true);
});

test("studentDateAvailability が createEmptyDb に含まれる", () => {
  const db = createEmptyDb();
  assert.equal(Array.isArray(db.studentDateAvailability), true);
});

test("teacherDateAvailability の不正 teacherId を validation が検出する", () => {
  const db = createEmptyDb();
  db.teacherDateAvailability.push({
    id: "tda-invalid",
    teacherId: "missing-teacher",
    date: "2026-07-20",
    lessonTimeSlotId: db.timeSlots[0].id
  });
  const issues = validateDb(db);
  assert.equal(issues.some((item) => item.includes("登録されていない講師")), true);
});

test("studentDateAvailability の不正 studentId を validation が検出する", () => {
  const db = createEmptyDb();
  db.studentDateAvailability.push({
    id: "sda-invalid",
    studentId: "missing-student",
    date: "2026-07-20",
    lessonTimeSlotId: db.timeSlots[0].id
  });
  const issues = validateDb(db);
  assert.equal(issues.some((item) => item.includes("登録されていない生徒")), true);
});

test("date 形式が YYYY-MM-DD でない場合に validation が検出する", () => {
  const db = createEmptyDb();
  const teacher = { id: "teacher-date-test", name: "日付確認", gender: "any", memo: "", extraJson: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.teachers.push(teacher);
  db.teacherDateAvailability.push({
    id: "tda-date-invalid",
    teacherId: teacher.id,
    date: "2026/07/20",
    lessonTimeSlotId: db.timeSlots[0].id
  });
  const issues = validateDb(db);
  assert.equal(issues.some((item) => item.includes("日付形式が不正")), true);
});

test("同じ対象者と日付と時間帯の重複を追加しない", () => {
  const rows = mergeDateAvailabilityRows([
    { id: "row-1", teacherId: "teacher-1", date: "2026-07-20", lessonTimeSlotId: "slot-1" }
  ], [
    { id: "row-2", teacherId: "teacher-1", date: "2026-07-20", lessonTimeSlotId: "slot-1" },
    { id: "row-3", teacherId: "teacher-1", date: "2026-07-20", lessonTimeSlotId: "slot-2" }
  ], "teacherId");
  assert.equal(rows.length, 2);
});
