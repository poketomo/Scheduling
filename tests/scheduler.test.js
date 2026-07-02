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
