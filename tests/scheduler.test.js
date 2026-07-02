import test from "node:test";
import assert from "node:assert/strict";

import { buildSampleDb } from "../src/sampleData.js";
import { generateScheduleSolutions } from "../src/scheduler.js";
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
  const student = db.students[0];
  const preferredTeacher = db.studentTeacherPreferences.find((item) => item.studentId === student.id && item.preferenceType === "preferred").teacherId;
  const candidate = { studentId: student.id, teacherId: preferredTeacher, subjectId: db.studentSubjectRequests.find((item) => item.studentId === student.id).subjectId, timeSlotId: db.studentAvailabilitySlots.find((item) => item.studentId === student.id).timeSlotId };
  const preferred = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set([preferredTeacher]),
    genderPreferenceIds: new Set(),
    teacherGender: "female",
    assignmentGroup: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const neutral = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    genderPreferenceIds: new Set(),
    teacherGender: "female",
    assignmentGroup: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(preferred.total > neutral.total);
});

test("希望性別一致でスコアが上がる", () => {
  const db = buildSampleDb();
  const student = db.students[0];
  const candidate = { studentId: student.id, teacherId: db.teachers[0].id, subjectId: db.studentSubjectRequests.find((item) => item.studentId === student.id).subjectId, timeSlotId: db.studentAvailabilitySlots.find((item) => item.studentId === student.id).timeSlotId };
  const matched = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    genderPreferenceIds: new Set(["female"]),
    teacherGender: "female",
    assignmentGroup: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  const unmatched = scoreCandidate(db, candidate, {
    preferredTeacherIds: new Set(),
    genderPreferenceIds: new Set(["male"]),
    teacherGender: "female",
    assignmentGroup: [],
    teacherAssignmentCount: 0,
    averageTeacherLoad: 0
  });
  assert.ok(matched.total > unmatched.total);
});

test("手のかかる度が高い生徒の集中が減点される", () => {
  const db = buildSampleDb();
  const assignmentGroup = [
    { studentId: db.students[0].id },
    { studentId: db.students[2].id },
    { studentId: db.students[5].id }
  ];
  const scored = scoreCandidate(db, { studentId: db.students[5].id, teacherId: db.teachers[0].id }, {
    preferredTeacherIds: new Set(),
    genderPreferenceIds: new Set(),
    teacherGender: "female",
    assignmentGroup,
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
  assert.equal(solution.summaryJson.unassigned.some((item) => typeof item.reason === "string" && item.reason.length > 0), true);
});

test("固定済み割当が再生成後も維持される", () => {
  const db = buildSampleDb();
  const initial = generateScheduleSolutions(db, { candidateCount: 1 });
  const assignment = initial.assignments[0];
  db.scheduleAssignments.push({ ...assignment, isLocked: true });
  const regenerated = generateScheduleSolutions(db, { candidateCount: 1, preserveLocks: true, lockedAssignments: db.scheduleAssignments.filter((item) => item.isLocked) });
  const locked = regenerated.assignments.find((item) => item.scheduleSolutionId === regenerated.solutions[0].id && item.studentId === assignment.studentId);
  assert.equal(Boolean(locked), true);
  assert.equal(locked.teacherId, assignment.teacherId);
  assert.equal(locked.timeSlotId, assignment.timeSlotId);
});
